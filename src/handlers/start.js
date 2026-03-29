import { Markup } from 'telegraf';
import { SUPPORTED_LANGUAGES } from '../config.js';
import { getOrCreateUser, getUserLanguage, joinConversation, getConversationPartnerInfo } from '../db.js';
import { translateGUI } from '../translations.js';
import { createLanguageKeyboard } from '../keyboards.js';

export function createStartHandler() {
  return async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code);
    const lang = user.language;

    const payload = ctx.payload;
    if (payload && payload.startsWith('join_')) {
      const code = payload.slice(5).toUpperCase();

      const result = joinConversation(code, ctx.from.id);

      if (result.error) {
        let errorKey;
        if (result.error === 'Conversation not found') errorKey = 'conv_not_found';
        else if (result.error === 'Already in this conversation') errorKey = 'already_joined';
        else if (result.error === 'Cannot join your own conversation') errorKey = 'own_conversation';
        else if (result.error === 'Conversation is full') errorKey = 'conv_full';
        else errorKey = result.error;

        await ctx.reply(`❌ ${translateGUI(errorKey, lang) || result.error}`);
        return;
      }

      const partner = getConversationPartnerInfo(code, ctx.from.id);

      let partnerInfo = '';
      if (partner) {
        const pLang = SUPPORTED_LANGUAGES[partner.language]?.native || partner.language;
        const partnerName = partner.username ? `@${partner.username}` : `User ${partner.user_id}`;
        partnerInfo = `\n\n${translateGUI('your_partner', lang)}: ${partnerName} (${pLang})`;
      }

      await ctx.reply(
        `✅ ${translateGUI('joined_conv', lang)}\n\n${translateGUI('your_language', lang)}: ${SUPPORTED_LANGUAGES[lang]?.native || lang}` +
        partnerInfo
      );

      try {
        const creatorId = result.conversation.creator_id;
        const pLang = getUserLanguage(creatorId);
        const joinedUsername = ctx.from.username ? `@${ctx.from.username}` : `User ${ctx.from.id}`;
        const joinedUserLang = SUPPORTED_LANGUAGES[lang]?.native || lang;

        await ctx.telegram.sendMessage(
          creatorId,
          `✅ ${translateGUI('partner_joined', pLang)}\n\n${joinedUsername} ${translateGUI('their_language', pLang).toLowerCase()}: ${joinedUserLang}`
        );
      } catch (error) {
        console.error('Failed to notify creator:', error);
      }
      return;
    }

    await ctx.reply(
      `${translateGUI('current_language', lang)}: ${SUPPORTED_LANGUAGES[lang]?.native || lang}\n\n${translateGUI('select_language', lang)}`,
      Markup.inlineKeyboard(createLanguageKeyboard())
    );
  };
}
