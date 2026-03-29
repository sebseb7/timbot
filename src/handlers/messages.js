import { Markup, Input } from 'telegraf';
import { getOrCreateUser, getUserLanguage, getUserOutput, getUserConversations, getConversationPartnerInfo } from '../db.js';
import { translateGUI, translate } from '../translations.js';
import { createPartnerSelectionKeyboard } from '../keyboards.js';
import { MAX_MESSAGE_LENGTH } from '../config.js';
import { prepareVoiceData, transcribeVoice, translateVoiceToAudio } from '../voice.js';

export function createMessageHandler(openai) {
  return async (ctx, originalText, isVoice = false, forceSelection = false, voiceBase64 = null) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code);
    const lang = user.language;

    // For voice in audio mode, we don't have text yet - it will be translated after partner selection
    const textLength = typeof originalText === 'string' ? originalText.length : 0;
    if (textLength > MAX_MESSAGE_LENGTH) {
      await ctx.reply(`❌ ${translateGUI('message_too_long', lang)} (${MAX_MESSAGE_LENGTH})`);
      return;
    }

    const conversations = getUserConversations(ctx.from.id);
    const activeConversations = conversations.filter(c => c.participant_id !== null);

    if (activeConversations.length === 0) {
      await ctx.reply(translateGUI('not_in_conv', lang));
      return;
    }

    // For voice messages in audio mode with voiceBase64, always show partner selection
    // because we need to know target language before translating
    if (isVoice && voiceBase64) {
      const textForStore = typeof originalText === 'string' ? originalText : '';
      const keyboard = createPartnerSelectionKeyboard(ctx.from.id, textForStore, null, voiceBase64);
      await ctx.reply(translateGUI('select_partner', lang), Markup.inlineKeyboard(keyboard));
      return;
    }

    // Text mode (text messages or voice transcribed to text)
    if (activeConversations.length === 1 && !forceSelection) {
      const conversation = activeConversations[0];
      const partner = getConversationPartnerInfo(conversation.id, ctx.from.id);

      if (!partner) {
        await ctx.reply(translateGUI('waiting_partner', lang));
        return;
      }

      const partnerLang = getUserLanguage(partner.user_id);

      let translatedText;
      let noTranslationNeeded = false;
      if (lang === partnerLang) {
        translatedText = originalText;
        noTranslationNeeded = true;
      } else {
        try {
          translatedText = await translate(originalText, partnerLang, openai);
        } catch (error) {
          await ctx.reply(`❌ ${translateGUI('translation_failed', lang)}`);
          return;
        }
      }

      try {
        const senderName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User ${ctx.from.id}`);
        await ctx.telegram.sendMessage(partner.user_id, `${senderName}:\n${translatedText}`);

        const deliveredMsg = translateGUI('message_delivered', lang);
        const partnerName = partner.username ? `@${partner.username}` : `User ${partner.user_id}`;
        const voicePrefix = isVoice ? '🎤 ' : '';
        let reply = `${voicePrefix}✅ ${deliveredMsg} ${partnerName}\n\n> ${translatedText.replace(/\n/g, '\n> ')}`;

        if (noTranslationNeeded) {
          reply += `\n\nℹ️ ${translateGUI('no_translation_needed', lang)}`;
        }

        await ctx.reply(reply);
      } catch (error) {
        console.error('Failed to send message to partner:', error);
        await ctx.reply(`❌ ${translateGUI('failed_send', lang)}`);
      }
    } else {
      // Multiple conversations - show partner selection
      const keyboard = createPartnerSelectionKeyboard(ctx.from.id, originalText);
      await ctx.reply(translateGUI('select_partner', lang), Markup.inlineKeyboard(keyboard));
    }
  };
}

export function createVoiceHandler(openai) {
  const handleMessage = createMessageHandler(openai);

  return async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code);
    const lang = user.language;

    // Get user's output mode
    const userOutput = getUserOutput(ctx.from.id);

    // Get conversations to check if any exist
    const conversations = getUserConversations(ctx.from.id);
    const activeConversations = conversations.filter(c => c.participant_id !== null);

    if (activeConversations.length === 0) {
      await ctx.reply(translateGUI('not_in_conv', lang));
      return;
    }

    try {
      // Download and prepare voice data
      const { base64str, originalBuffer } = await prepareVoiceData(ctx, ctx.message);

      if (userOutput === 'audio') {
        // Audio mode: Transcribe immediately for sender, store voice for later translation
        const transcription = await transcribeVoice(originalBuffer, openai);
        if (!transcription || transcription.trim().length === 0) {
          await ctx.reply(`❌ ${translateGUI('voice_transcribe_failed', lang)}`);
          return;
        }
        await ctx.reply(`🎤 ${translateGUI('transcription', lang)}:\n> ${transcription.replace(/\n/g, '\n> ')}`);
        // Store voice base64 and show partner selection (translation happens after selection)
        await handleMessage(ctx, transcription, true, true, base64str);
      } else {
        // Text mode: Transcribe with Whisper, then handle as text
        const transcription = await transcribeVoice(originalBuffer, openai);
        if (!transcription || transcription.trim().length === 0) {
          await ctx.reply(`❌ ${translateGUI('voice_transcribe_failed', lang)}`);
          return;
        }
        await ctx.reply(`🎤 ${translateGUI('transcription', lang)}:\n> ${transcription.replace(/\n/g, '\n> ')}`);
        // Always wait for confirmation when input was voice
        await handleMessage(ctx, transcription, true, true);
      }
    } catch (error) {
      console.error('Voice processing error:', error);
      await ctx.reply(`❌ ${translateGUI('voice_transcribe_failed', lang)}`);
    }
  };
}

// Called from actions.js when voice message partner is selected in audio mode
export async function handleVoiceAudioSend(ctx, partnerId, voiceBase64, openai) {
  const user = getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code);
  const lang = user.language;
  const partnerLang = getUserLanguage(partnerId);

  try {
    // Translate voice to target language audio
    const result = await translateVoiceToAudio(voiceBase64, partnerLang, openai);

    const senderName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User ${ctx.from.id}`);

    // Send voice message to partner
    const oggBuffer = Buffer.from(result.audioData, 'base64');
    await ctx.telegram.sendVoice(partnerId, Input.fromBuffer(oggBuffer, 'voice.ogg'), {
      caption: `${senderName}:\n${result.text}`
    });

    const partner = await ctx.telegram.getChat(partnerId);
    const partnerName = partner.username ? `@${partner.username}` : partner.first_name;

    await ctx.editMessageText(
      `🎤 ✅ ${translateGUI('sent_to', lang)} ${partnerName}\n\n> ${result.text.replace(/\n/g, '\n> ')}`,
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery(`${translateGUI('message_delivered', lang)} ${partnerName}`);
  } catch (error) {
    console.error('Failed to send voice:', error);
    await ctx.answerCbQuery(translateGUI('failed_send', lang));
  }
}
