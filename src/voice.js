import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { toFile } from 'openai';
import { SUPPORTED_LANGUAGES } from './config.js';

function convertOpusToOgg(opusBase64, outputPath) {
  return new Promise((resolve, reject) => {
    // Write opus data to temp file
    const tempDir = mkdtempSync(join(tmpdir(), 'opus-'));
    const opusPath = join(tempDir, 'input.opus');
    writeFileSync(opusPath, Buffer.from(opusBase64, 'base64'));

    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", opusPath,
      "-c:a", "copy",
      "-f", "ogg",
      outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("close", (code) => {
      rmSync(tempDir, { recursive: true, force: true });
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });
}

function convertOggToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });
}

// Download voice message and convert to base64 for later processing
export async function prepareVoiceData(ctx, msg) {
  const fileId = msg.voice.file_id;
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(link.href);

  if (!res.ok) {
    throw new Error(`Telegram voice download failed: HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  // Convert OGG to WAV using ffmpeg
  const tempDir = mkdtempSync(join(tmpdir(), 'voice-'));
  const oggPath = join(tempDir, 'input.ogg');
  const wavPath = join(tempDir, 'output.wav');

  try {
    writeFileSync(oggPath, buffer);
    await convertOggToWav(oggPath, wavPath);
    const wavBuffer = readFileSync(wavPath);
    const base64str = wavBuffer.toString('base64');
    return { base64str, originalBuffer: buffer };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// Text mode: Use Whisper for transcription only
export async function transcribeVoice(buffer, openai) {
  const file = await toFile(buffer, 'voice_message.ogg', { type: 'audio/ogg' });

  const startWhisper = performance.now();
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });
  const whisperTime = performance.now() - startWhisper;

  console.log('whisper-1 transcription:', transcription.text, '\nwhisper-1_time:', whisperTime.toFixed(0) + 'ms');

  return transcription.text ?? '';
}

// Text-to-audio: Translate text and generate audio using gpt-audio-1.5
export async function translateTextToAudio(text, targetLang, openai) {
  const targetLangName = SUPPORTED_LANGUAGES[targetLang]?.name || targetLang;

  const startAudio = performance.now();
  const response = await openai.chat.completions.create({
    model: "gpt-audio-1.5",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Translate to ${targetLangName} : "${text}" Just Answer with the translation.` }
        ]
      }
    ],
    modalities: ["text", "audio"],
    audio: {
      "voice": "alloy",
      "format": "opus"
    },
  });
  const audioTime = performance.now() - startAudio;

  const transcript = response.choices[0].message.audio.transcript;
  const opusData = response.choices[0].message.audio.data;

  // Wrap opus data in OGG container for Telegram
  const tempDir = mkdtempSync(join(tmpdir(), 'audio-'));
  const oggPath = join(tempDir, 'output.ogg');

  try {
    await convertOpusToOgg(opusData, oggPath);
    const oggBuffer = readFileSync(oggPath);
    const audioData = oggBuffer.toString('base64');

    console.log('text-to-audio transcript:', transcript, '\ngpt-audio-1.5_time:', audioTime.toFixed(0) + 'ms');

    return { text: transcript, audioData };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// Audio mode: Use gpt-audio-1.5 for direct audio translation (called after partner selection)
export async function translateVoiceToAudio(base64str, targetLang, openai) {
  const targetLangName = SUPPORTED_LANGUAGES[targetLang]?.name || targetLang;

  const startAudio = performance.now();
  const response = await openai.chat.completions.create({
    model: "gpt-audio-1.5",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Translate to ${targetLangName}, only respond with the translation` },
          { type: "input_audio", input_audio: { data: base64str, format: "wav" }}
        ]
      }
    ],
    modalities: ["text", "audio"],
    audio: {
      "voice": "alloy",
      "format": "opus"
    },
  });
  const audioTime = performance.now() - startAudio;

  const transcript = response.choices[0].message.audio.transcript;
  const opusData = response.choices[0].message.audio.data;

  // Wrap opus data in OGG container for Telegram
  const tempDir = mkdtempSync(join(tmpdir(), 'audio-'));
  const oggPath = join(tempDir, 'output.ogg');

  try {
    await convertOpusToOgg(opusData, oggPath);
    const oggBuffer = readFileSync(oggPath);
    const audioData = oggBuffer.toString('base64');

    console.log('gpt-audio-1.5 transcript:', transcript, '\ngpt-audio-1.5_time:', audioTime.toFixed(0) + 'ms');

    return { text: transcript, audioData };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
