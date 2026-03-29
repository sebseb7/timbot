import { Markup } from 'telegraf';
import { SUPPORTED_LANGUAGES } from './config.js';
import { getUserConversations, getConversationPartnerInfo, getUserLanguage } from './db.js';
import { randomBytes } from 'crypto';

// Temporary storage for message text (to avoid exceeding Telegram's 64-byte callback data limit)
const messageStore = new Map();
const MESSAGE_STORE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function storeMessage(text, audioData = null, voiceBase64 = null) {
  const id = randomBytes(4).toString('hex');
  messageStore.set(id, { text, audioData, voiceBase64 });
  // Auto-cleanup after timeout
  setTimeout(() => messageStore.delete(id), MESSAGE_STORE_TIMEOUT);
  return id;
}

export function retrieveMessage(id) {
  const data = messageStore.get(id);
  messageStore.delete(id); // One-time use
  return data;
}

export function createLanguageKeyboard() {
  const languages = Object.entries(SUPPORTED_LANGUAGES);
  const buttons = languages.map(([code, info]) =>
    Markup.button.callback(`${info.flag} ${info.native}`, `lang:${code}`)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }

  return rows;
}

export function createPartnerSelectionKeyboard(userId, messageText, audioData = null, voiceBase64 = null) {
  const conversations = getUserConversations(userId).filter(c => c.participant_id !== null);
  const buttons = [];
  const messageId = storeMessage(messageText, audioData, voiceBase64);

  for (const conv of conversations) {
    const partner = getConversationPartnerInfo(conv.id, userId);
    if (!partner) continue;
    const partnerLang = getUserLanguage(partner.user_id);
    const flag = SUPPORTED_LANGUAGES[partnerLang]?.flag || '';
    const displayName = partner.username || `User ${partner.user_id}`;
    buttons.push(Markup.button.callback(
      `${flag} ${displayName}`,
      `send:${conv.id}:${partner.user_id}:${messageId}`
    ));
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return rows;
}

export function createLeaveConversationKeyboard(userId) {
  const conversations = getUserConversations(userId).filter(c => c.participant_id !== null);
  const buttons = [];

  for (const conv of conversations) {
    const partner = getConversationPartnerInfo(conv.id, userId);
    const partnerName = partner ? (partner.username || `User ${partner.user_id}`) : 'Unknown';
    const label = `Chat with ${partnerName}`;
    buttons.push(Markup.button.callback(label, `leave:${conv.id}`));
  }

  return buttons.map(btn => [btn]);
}
