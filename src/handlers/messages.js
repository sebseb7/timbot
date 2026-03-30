import { Markup, Input } from 'telegraf';
import { getOrCreateUser, getUserLanguage, getUserConversations, getConversationPartnerInfo, getUserOutput } from '../db.js';
import { translateGUI, translate } from '../translations.js';
import { createPartnerSelectionKeyboard } from '../keyboards.js';
import { MAX_MESSAGE_LENGTH, DISABLE_RECEIVE_AUDIO } from '../config.js';
import { prepareVoiceData, transcribeVoice, translateVoiceToAudio, translateTextToAudio } from '../voice.js';

export function createMessageHandler(openai) {
  return async (ctx, originalText, isVoice = false, forceSelection = false, voiceBase64 = null) => {
    // Ignore /output command when DISABLE_RECEIVE_AUDIO is true
    if (DISABLE_RECEIVE_AUDIO && originalText === '/output') {
      return;
    }

    const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;

    // For voice in audio mode, we don't have text yet - it will be translated after partner selection
    const textLength = typeof originalText === 'string' ? originalText.length : 0;
    if (textLength > MAX_MESSAGE_LENGTH) {
      await ctx.reply(`❌ ${translateGUI('message_too_long', lang)} (${MAX_MESSAGE_LENGTH})`);
      return;
    }

    const conversations = await getUserConversations(ctx.from.id);
    const activeConversations = conversations.filter(c => c.participant_id !== null);

    if (activeConversations.length === 0) {
      await ctx.reply(translateGUI('not_in_conv', lang));
      return;
    }

    // Voice messages always show partner selection
    if (isVoice && voiceBase64) {
      const textForStore = typeof originalText === 'string' ? originalText : '';
      const keyboard = await createPartnerSelectionKeyboard(ctx.from.id, textForStore, null, voiceBase64);
      await ctx.reply(translateGUI('select_partner', lang), Markup.inlineKeyboard(keyboard));
      return;
    }

    // Text messages - send directly if single partner
    if (activeConversations.length === 1 && !forceSelection) {
      const conversation = activeConversations[0];
      const partner = await getConversationPartnerInfo(conversation.id, ctx.from.id);

      if (!partner) {
        await ctx.reply(translateGUI('waiting_partner', lang));
        return;
      }

      const partnerLang = await getUserLanguage(partner.user_id);
      const partnerOutput = await getUserOutput(partner.user_id);

      // Receiver wants audio: translate text and generate audio
      if (partnerOutput === 'audio') {
        await handleTextToAudioSend(ctx, partner.user_id, originalText, openai);
        return;
      }

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
        const partnerName = partner.username || `User ${partner.user_id}`;
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
      const keyboard = await createPartnerSelectionKeyboard(ctx.from.id, originalText, null, voiceBase64);
      await ctx.reply(translateGUI('select_partner', lang), Markup.inlineKeyboard(keyboard));
    }
  };
}

export function createVoiceHandler(openai) {
  const handleMessage = createMessageHandler(openai);

  return async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;

    // Get conversations to check if any exist
    const conversations = await getUserConversations(ctx.from.id);
    const activeConversations = conversations.filter(c => c.participant_id !== null);

    if (activeConversations.length === 0) {
      await ctx.reply(translateGUI('not_in_conv', lang));
      return;
    }

    try {
      // Download and prepare voice data
      const { base64str, originalBuffer } = await prepareVoiceData(ctx, ctx.message);

      // Always transcribe for sender preview
      const transcription = await transcribeVoice(originalBuffer, openai);
      if (!transcription || transcription.trim().length === 0) {
        await ctx.reply(`❌ ${translateGUI('voice_transcribe_failed', lang)}`);
        return;
      }
      await ctx.reply(`🎤 ${translateGUI('transcription', lang)}:\n> ${transcription.replace(/\n/g, '\n> ')}`);

      // Always pass voiceBase64 - delivery format is determined by receiver's output mode
      await handleMessage(ctx, transcription, true, true, base64str);
    } catch (error) {
      console.error('Voice processing error:', error);
      await ctx.reply(`❌ ${translateGUI('voice_transcribe_failed', lang)}`);
    }
  };
}

// Called from both actions.js (callback query) and createMessageHandler (message context)
export async function handleVoiceAudioSend(ctx, partnerId, voiceBase64, openai) {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
  const lang = user.language;
  const partnerLang = await getUserLanguage(partnerId);
  const isCallback = !!ctx.callbackQuery;

  try {
    const result = await translateVoiceToAudio(voiceBase64, partnerLang, openai);

    const senderName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User ${ctx.from.id}`);

    const oggBuffer = Buffer.from(result.audioData, 'base64');
    await ctx.telegram.sendVoice(partnerId, Input.fromBuffer(oggBuffer, 'voice.ogg'), {
      caption: `${senderName}:\n${result.text}`
    });

    const partner = await ctx.telegram.getChat(partnerId);
    const partnerName = partner.username ? `@${partner.username}` : partner.first_name;

    const replyText = `🎤 ✅ ${translateGUI('sent_to', lang)} ${partnerName}\n\n> ${result.text.replace(/\n/g, '\n> ')}`;
    if (isCallback) {
      await ctx.editMessageText(replyText, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(replyText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Failed to send voice:', error);
    if (isCallback) {
      await ctx.answerCbQuery(translateGUI('failed_send', lang));
    } else {
      await ctx.reply(`❌ ${translateGUI('failed_send', lang)}`);
    }
  }
}

// Text-to-audio: translate text and generate audio for receiver who wants audio
export async function handleTextToAudioSend(ctx, partnerId, text, openai) {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
  const lang = user.language;
  const partnerLang = await getUserLanguage(partnerId);
  const isCallback = !!ctx.callbackQuery;

  try {
    const result = await translateTextToAudio(text, partnerLang, openai);

    const senderName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User ${ctx.from.id}`);

    const oggBuffer = Buffer.from(result.audioData, 'base64');
    await ctx.telegram.sendVoice(partnerId, Input.fromBuffer(oggBuffer, 'voice.ogg'), {
      caption: `${senderName}:\n${result.text}`
    });

    const partner = await ctx.telegram.getChat(partnerId);
    const partnerName = partner.username ? `@${partner.username}` : partner.first_name;

    const replyText = `🎤 ✅ ${translateGUI('sent_to', lang)} ${partnerName}\n\n> ${result.text.replace(/\n/g, '\n> ')}`;
    if (isCallback) {
      await ctx.editMessageText(replyText, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(replyText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Failed to send text as audio:', error);
    if (isCallback) {
      await ctx.answerCbQuery(translateGUI('failed_send', lang));
    } else {
      await ctx.reply(`❌ ${translateGUI('failed_send', lang)}`);
    }
  }
}
