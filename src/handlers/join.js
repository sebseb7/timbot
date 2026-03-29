import { getOrCreateUser, getUserLanguage, joinConversation, getConversationPartnerInfo } from '../db.js';
import { translateGUI } from '../translations.js';
import { SUPPORTED_LANGUAGES, COMMANDS } from '../config.js';

export function createJoinHandler() {
  return async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;
    const code = ctx.message.text.split(' ')[1]?.trim().toUpperCase();

    if (!code) {
      const provideCode = translateGUI('provide_code', lang);
      const example = translateGUI('example', lang);
      await ctx.reply(`${provideCode}\n${example}: /${COMMANDS.JOIN.name} ABC123`);
      return;
    }

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
      const partnerName = partner.username || `User ${partner.user_id}`;
      partnerInfo = `\n\n${translateGUI('your_partner', lang)}: ${partnerName} (${pLang})`;
    }

    await ctx.reply(
      `✅ ${translateGUI('joined_conv', lang)}\n\n${translateGUI('your_language', lang)}: ${SUPPORTED_LANGUAGES[lang]?.native || lang}` +
      partnerInfo
    );

    try {
      const creatorId = result.conversation.creator_id;
      const joinedUsername = ctx.from.username || ctx.from.first_name || `User ${ctx.from.id}`;
      const joinedUserLang = SUPPORTED_LANGUAGES[lang]?.native || lang;
      const pLang = getUserLanguage(creatorId);

      await ctx.telegram.sendMessage(
        creatorId,
        `✅ ${translateGUI('partner_joined', pLang)}\n\n${joinedUsername} ${translateGUI('their_language', pLang).toLowerCase()}: ${joinedUserLang}`
      );
    } catch (error) {
      console.error('Failed to notify creator:', error);
    }
  };
}
