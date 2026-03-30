import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { toFile } from 'openai';
import { SUPPORTED_LANGUAGES, USE_LOCAL_WHISPER, WHISPER_MODEL_URL, WHISPER_CPP_PATH, FFMPEG_PATH } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to store the downloaded GGUF model
const MODELS_DIR = join(__dirname, '..', 'models');
const MODEL_FILENAME = 'model.gguf';
const MODEL_PATH = join(MODELS_DIR, MODEL_FILENAME);

// Track download promise to avoid duplicate downloads
let downloadPromise = null;

// Download model file if it doesn't exist
async function ensureModelDownloaded() {
  if (existsSync(MODEL_PATH)) {
    return MODEL_PATH;
  }

  // Return existing promise if download is already in progress
  if (downloadPromise) {
    return downloadPromise;
  }

  downloadPromise = (async () => {
    console.log('Downloading Whisper model from:', WHISPER_MODEL_URL);
    console.log('This may take a few minutes...');

    // Create models directory if it doesn't exist
    if (!existsSync(MODELS_DIR)) {
      mkdirSync(MODELS_DIR, { recursive: true });
    }

    // Use curl to download with redirect support
    await new Promise((resolve, reject) => {
      const curl = spawn('curl', [
        '-L',           // Follow redirects
        '-o', MODEL_PATH,
        '--progress-bar', // Show progress bar
        WHISPER_MODEL_URL
      ]);

      // Pipe curl progress to stdout
      curl.stdout.on('data', (data) => {
        process.stdout.write(data.toString());
      });

      curl.stderr.on('data', (data) => {
        process.stdout.write(data.toString());
      });

      curl.on('close', (code) => {
        if (code === 0) {
          console.log('\nModel downloaded successfully!');
          resolve();
        } else {
          reject(new Error(`curl exited with code ${code}`));
        }
      });

      curl.on('error', (err) => {
        reject(new Error(`Failed to download model: ${err.message}`));
      });
    });

    // Verify the file was downloaded and is a valid GGUF file
    if (!existsSync(MODEL_PATH)) {
      throw new Error('Model file was not created');
    }

    // Check for valid model format (GGUF or legacy ggml format)
    // ggml models use little-endian magic: "lmgg" (reversed "ggml")
    const fd = readFileSync(MODEL_PATH);
    const magic = fd.slice(0, 4).toString('ascii');
    if (magic !== 'GGUF' && magic !== 'lmgg') {
      throw new Error('Downloaded file is not a valid Whisper model (bad magic: ' + magic + '). Check the WHISPER_MODEL_URL.');
    }

    return MODEL_PATH;
  })();

  return downloadPromise;
}

// Initialize local Whisper - call this at app startup
export async function initLocalWhisper() {
  if (USE_LOCAL_WHISPER) {
    console.log('Initializing local Whisper...');
    await ensureModelDownloaded();
    console.log('Local Whisper ready!');
  }
}

// Transcribe using local whisper.cpp binary
async function transcribeWithLocalWhisper(audioPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', MODEL_PATH,
      '-f', audioPath,
      '-l', 'auto',
      '-t', '16',
      '-bo', '1',
      '-bs', '1',
      '--output-txt',
      '--output-file', audioPath.replace(/\.[^.]+$/, ''),
    ];

    const whisper = spawn(WHISPER_CPP_PATH, args);

    let stdout = '';
    let stderr = '';

    whisper.stdout.on('data', (data) => stdout += data.toString());
    whisper.stderr.on('data', (data) => stderr += data.toString());

    whisper.on('close', (code) => {
      if (code === 0) {
        // Read the output text file
        const txtPath = audioPath.replace(/\.[^.]+$/, '.txt');
        if (existsSync(txtPath)) {
          const text = readFileSync(txtPath, 'utf-8').trim();
          // Clean up the txt file
          rmSync(txtPath, { force: true });
          resolve(text);
        } else {
          // Fallback to stdout if no txt file
          resolve(stdout.trim());
        }
      } else {
        reject(new Error(`Whisper.cpp exited with code ${code}\n${stderr}`));
      }
    });

    whisper.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(
          `Whisper binary not found at '${WHISPER_CPP_PATH}'. ` +
          `Set WHISPER_CPP_PATH in your .env file. Install from: https://github.com/ggerganov/whisper.cpp`
        ));
      } else {
        reject(err);
      }
    });
  });
}

function convertOpusToOgg(opusBase64, outputPath) {
  return new Promise((resolve, reject) => {
    // Write opus data to temp file
    const tempDir = mkdtempSync(join(tmpdir(), 'opus-'));
    const opusPath = join(tempDir, 'input.opus');
    writeFileSync(opusPath, Buffer.from(opusBase64, 'base64'));

    const ffmpeg = spawn(FFMPEG_PATH, [
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
    const ffmpeg = spawn(FFMPEG_PATH, [
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
  // Use local Whisper if enabled
  if (USE_LOCAL_WHISPER) {
    return transcribeVoiceLocal(buffer);
  }

  // Use OpenAI Whisper API
  const file = await toFile(buffer, 'voice_message.ogg', { type: 'audio/ogg' });

  const startWhisper = performance.now();
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });
  const whisperTime = performance.now() - startWhisper;

  console.log('whisper-1_time:', whisperTime.toFixed(0) + 'ms');

  return transcription.text ?? '';
}

// Local Whisper transcription using whisper.cpp
async function transcribeVoiceLocal(buffer) {
  // Ensure model is downloaded
  await ensureModelDownloaded();

  // Create temp directory and save audio file
  const tempDir = mkdtempSync(join(tmpdir(), 'whisper-'));
  const inputPath = join(tempDir, 'input.ogg');
  const wavPath = join(tempDir, 'input.wav');

  try {
    writeFileSync(inputPath, buffer);
    
    // Convert to WAV format (16kHz mono) for whisper.cpp
    await convertOggToWav(inputPath, wavPath);

    const startWhisper = performance.now();
    const text = await transcribeWithLocalWhisper(wavPath);
    const whisperTime = performance.now() - startWhisper;

    console.log('local_whisper_time:', whisperTime.toFixed(0) + 'ms');

    return text;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
