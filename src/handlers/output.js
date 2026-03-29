import { Markup } from 'telegraf';
import { COMMANDS } from '../config.js';
import { getOrCreateUser, setUserOutput, getUserOutput, getUserLanguage } from '../db.js';
import { translateGUI } from '../translations.js';

export function createOutputHandler() {
  return async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;
    const currentOutput = user.output || 'text';

    await ctx.reply(
      `${translateGUI('current_output', lang)}: ${currentOutput}\n\n${translateGUI('select_output', lang)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(translateGUI('output_text', lang), 'output:text')],
        [Markup.button.callback(translateGUI('output_audio', lang), 'output:audio')]
      ])
    );
  };
}

export function createOutputActionHandler() {
  return async (ctx) => {
    const outputMode = ctx.match[1];

    if (outputMode !== 'text' && outputMode !== 'audio') {
      await ctx.answerCbQuery('Invalid output mode');
      return;
    }

    await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    await setUserOutput(ctx.from.id, outputMode);

    const lang = await getUserLanguage(ctx.from.id);

    await ctx.editMessageText(
      `✅ ${translateGUI('output_set', lang)}: ${outputMode}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    await ctx.answerCbQuery(translateGUI('output_updated', lang));
  };
}
