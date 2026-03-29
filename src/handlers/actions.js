import { Input } from 'telegraf';
import { getUserLanguage, getUserOutput } from '../db.js';
import { translateGUI, translate } from '../translations.js';
import { retrieveMessage } from '../keyboards.js';
import { handleVoiceAudioSend, handleTextToAudioSend } from './messages.js';

export function createSendActionHandler(openai) {
  return async (ctx) => {
    const partnerId = parseInt(ctx.match[2]);
    const messageId = ctx.match[3];
    const messageData = retrieveMessage(messageId);

    if (!messageData) {
      await ctx.answerCbQuery('Message expired. Please send again.');
      return;
    }

    const { text: messageText, audioData, voiceBase64 } = messageData;

    const userId = ctx.from.id;
    const lang = await getUserLanguage(userId);
    const partnerLang = await getUserLanguage(partnerId);
    const partnerOutput = await getUserOutput(partnerId);

    try {
      const partner = await ctx.telegram.getChat(partnerId);
      const partnerName = partner.username ? `@${partner.username}` : partner.first_name;
      const senderName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User ${ctx.from.id}`);

      // If receiver wants audio and we have voice data, deliver as audio
      if (partnerOutput === 'audio' && voiceBase64) {
        await handleVoiceAudioSend(ctx, partnerId, voiceBase64, openai);
        return;
      }

      // If receiver wants audio and we have pre-recorded audio data, send voice message
      if (partnerOutput === 'audio' && audioData) {
        await ctx.telegram.sendVoice(partnerId, Input.fromBuffer(Buffer.from(audioData, 'base64'), 'voice.ogg'), {
          caption: `${senderName}:`
        });

        await ctx.editMessageText(
          `🎤 ✅ ${translateGUI('sent_to', lang)} ${partnerName}\n\n> ${messageText.replace(/\n/g, '\n> ')}`,
          { parse_mode: 'HTML' }
        );
      } else if (partnerOutput === 'audio' && messageText) {
        // Receiver wants audio: translate text and generate audio
        await handleTextToAudioSend(ctx, partnerId, messageText, openai);
      } else {
        // Text mode: translate and send text message
        const translatedText = await translate(messageText, partnerLang, openai);
        await ctx.telegram.sendMessage(partnerId, `${senderName}:\n${translatedText}`);

        await ctx.editMessageText(
          `✅ ${translateGUI('sent_to', lang)} ${partnerName}\n\n> ${translatedText.replace(/\n/g, '\n> ')}`,
          { parse_mode: 'HTML' }
        );
      }

      await ctx.answerCbQuery(`${translateGUI('message_delivered', lang)} ${partnerName}`);
    } catch (error) {
      console.error('Failed to send message:', error);
      await ctx.answerCbQuery(translateGUI('failed_send', lang));
    }
  };
}
