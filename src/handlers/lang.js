import { Markup } from 'telegraf';
import { SUPPORTED_LANGUAGES, COMMANDS } from '../config.js';
import { getOrCreateUser, setUserLanguage, getUserLanguage, getActiveConversations } from '../db.js';
import { translateGUI } from '../translations.js';
import { createLanguageKeyboard } from '../keyboards.js';

export function createLangHandler() {
  return async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;

    await ctx.reply(
      `${translateGUI('current_language', lang)}: ${SUPPORTED_LANGUAGES[lang]?.native || lang}\n\n${translateGUI('select_language', lang)}`,
      Markup.inlineKeyboard(createLanguageKeyboard())
    );
  };
}

export function createLangActionHandler() {
  return async (ctx) => {
    const langCode = ctx.match[1];

    if (!SUPPORTED_LANGUAGES[langCode]) {
      await ctx.answerCbQuery(translateGUI('invalid_language', await getUserLanguage(ctx.from.id)));
      return;
    }

    await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    await setUserLanguage(ctx.from.id, langCode);

    await ctx.editMessageText(
      `✅ ${translateGUI('language_set', langCode)}: ${SUPPORTED_LANGUAGES[langCode].native}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    await ctx.answerCbQuery(translateGUI('language_updated', langCode));

    // Send welcome message if user is not in a conversation (first-time setup)
    const activeConvs = await getActiveConversations(ctx.from.id);
    if (activeConvs.length === 0) {
      await ctx.reply(
        `${translateGUI('welcome', langCode)}\n\n` +
        `${translateGUI('commands', langCode)}:\n` +
        `/${COMMANDS.NEW.name} - ${translateGUI('cmd_new', langCode)}\n` +
        `/${COMMANDS.JOIN.name} <code> - ${translateGUI('cmd_join', langCode)}\n` +
        `/${COMMANDS.LEAVE.name} - ${translateGUI('cmd_leave', langCode)}\n` +
        `/${COMMANDS.LANG.name} - ${translateGUI('cmd_lang', langCode)}\n` +
        `/${COMMANDS.OUTPUT.name} - ${translateGUI('cmd_output', langCode)}\n\n` +
        `${translateGUI('current_language', langCode)}: ${SUPPORTED_LANGUAGES[langCode]?.native || langCode}`
      );
    }
  };
}
