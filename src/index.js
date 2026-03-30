import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { COMMANDS, DISABLE_RECEIVE_AUDIO } from './config.js';
import { initLocalWhisper } from './voice.js';

const BOT_COMMANDS = Object.values(COMMANDS)
  .filter(c => !DISABLE_RECEIVE_AUDIO || c !== COMMANDS.OUTPUT)
  .map(c => ({
    command: c.name,
    description: c.description
  }));
import { createStartHandler } from './handlers/start.js';
import { createNewHandler } from './handlers/new.js';
import { createJoinHandler } from './handlers/join.js';
import { createLeaveHandler, createLeaveActionHandler } from './handlers/leave.js';
import { createLangHandler, createLangActionHandler } from './handlers/lang.js';
import { createOutputHandler, createOutputActionHandler } from './handlers/output.js';
import { createSendActionHandler } from './handlers/actions.js';
import { createMessageHandler, createVoiceHandler } from './handlers/messages.js';

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Set bot commands
bot.telegram.setMyCommands(BOT_COMMANDS);

// Command handlers
bot.start(createStartHandler());
bot.command(COMMANDS.NEW.name, createNewHandler());
bot.command(COMMANDS.JOIN.name, createJoinHandler());
bot.command(COMMANDS.LEAVE.name, createLeaveHandler());
bot.command(COMMANDS.LANG.name, createLangHandler());
if (!DISABLE_RECEIVE_AUDIO) {
  bot.command(COMMANDS.OUTPUT.name, createOutputHandler());
}

// Action handlers
bot.action(/lang:(.+)/, createLangActionHandler());
bot.action(/leave:(.+)/, createLeaveActionHandler());
bot.action(/send:(.+):(.+):(.+)/, createSendActionHandler(openai));
if (!DISABLE_RECEIVE_AUDIO) {
  bot.action(/output:(.+)/, createOutputActionHandler());
}

// Message handlers
const handleMessage = createMessageHandler(openai);
bot.on('text', (ctx) => handleMessage(ctx, ctx.message.text, false));
bot.on('voice', createVoiceHandler(openai));

// Start bot
initLocalWhisper().catch(err => {
  console.error('Failed to initialize local Whisper:', err.message);
});
bot.launch();
console.log('Bot started!');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
