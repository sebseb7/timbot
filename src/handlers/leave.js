import { getOrCreateUser, getUserLanguage, getUserConversations, leaveConversation, getConversationPartnerInfo } from '../db.js';
import { translateGUI } from '../translations.js';
import { createLeaveConversationKeyboard } from '../keyboards.js';
import { Markup } from 'telegraf';

export function createLeaveHandler() {
  return async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;

    const conversations = await getUserConversations(ctx.from.id);
    const activeConversations = conversations.filter(c => c.participant_id !== null);

    if (activeConversations.length === 0) {
      const msg = translateGUI('no_active_conv', lang);
      await ctx.reply(`❌ ${msg}`);
      return;
    }

    if (activeConversations.length === 1) {
      const conversationId = activeConversations[0].id;
      const partner = await getConversationPartnerInfo(conversationId, ctx.from.id);

      const result = await leaveConversation(ctx.from.id, conversationId);

      if (result.error) {
        const msg = translateGUI('no_active_conv', lang);
        await ctx.reply(`❌ ${msg}`);
        return;
      }

      const left = translateGUI('left_conv', lang);
      await ctx.reply(`✅ ${left}`);

      if (partner) {
        try {
          const pLang = await getUserLanguage(partner.user_id);
          const leftUsername = ctx.from.username || ctx.from.first_name || `User ${ctx.from.id}`;
          await ctx.telegram.sendMessage(partner.user_id, `⚠️ ${leftUsername} ${translateGUI('user_left_conv', pLang)}`);
        } catch (error) {
          console.error('Failed to notify partner:', error);
        }
      }
    } else {
      const keyboard = await createLeaveConversationKeyboard(ctx.from.id);
      await ctx.reply(translateGUI('select_conv_leave', lang), Markup.inlineKeyboard(keyboard));
    }
  };
}

export function createLeaveActionHandler() {
  return async (ctx) => {
    const conversationId = ctx.match[1];
    const userId = ctx.from.id;
    const lang = await getUserLanguage(userId);

    const partner = await getConversationPartnerInfo(conversationId, userId);

    const result = await leaveConversation(userId, conversationId);

    if (result.error) {
      await ctx.answerCbQuery(translateGUI('no_active_conv', lang));
      return;
    }

    await ctx.editMessageText(`✅ ${translateGUI('left_conv', lang)}`);
    await ctx.answerCbQuery(translateGUI('left_conv', lang));

    if (partner) {
      try {
        const pLang = await getUserLanguage(partner.user_id);
        const userInfo = await getOrCreateUser(userId, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
        const leftUsername = userInfo?.username || `User ${userId}`;
        await ctx.telegram.sendMessage(partner.user_id, `⚠️ ${leftUsername} ${translateGUI('user_left_conv', pLang)}`);
      } catch (error) {
        console.error('Failed to notify partner:', error);
      }
    }
  };
}
