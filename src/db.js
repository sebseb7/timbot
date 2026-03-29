import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';

mkdirSync('./data', { recursive: true });
const db = new Database('./data/bot.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    language TEXT DEFAULT 'en',
    output TEXT DEFAULT 'text'
  );
`);

export function getOrCreateUser(userId, username, languageCode = 'en', firstName = null) {
  const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
  let user = stmt.get(userId);

  if (!user) {
    // Store username if available, otherwise store first_name as display name
    const name = username || firstName || null;
    const insert = db.prepare('INSERT INTO users (user_id, username, language, output) VALUES (?, ?, ?, ?)');
    insert.run(userId, name, languageCode, 'text');
    user = { user_id: userId, username: name, language: languageCode, output: 'text' };
  } else if (!user.username && (username || firstName)) {
    // Backfill name for existing users
    const name = username || firstName;
    db.prepare('UPDATE users SET username = ? WHERE user_id = ?').run(name, userId);
    user.username = name;
  }

  return user;
}

export function setUserLanguage(userId, language) {
  const stmt = db.prepare('UPDATE users SET language = ? WHERE user_id = ?');
  stmt.run(language, userId);
}

export function getUserLanguage(userId) {
  const stmt = db.prepare('SELECT language FROM users WHERE user_id = ?');
  const row = stmt.get(userId);
  return row ? row.language : 'en';
}

export function setUserOutput(userId, output) {
  const stmt = db.prepare('UPDATE users SET output = ? WHERE user_id = ?');
  stmt.run(output, userId);
}

export function getUserOutput(userId) {
  const stmt = db.prepare('SELECT output FROM users WHERE user_id = ?');
  const row = stmt.get(userId);
  return row ? row.output : 'text';
}

export function createConversation(creatorId) {
  const code = randomBytes(4).toString('hex').toUpperCase();
  const insertStmt = db.prepare(`
    INSERT INTO conversations (id, creator_id) VALUES (?, ?)
  `);
  insertStmt.run(code, creatorId);
  return code;
}

export function joinConversation(code, participantId) {
  const convStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  const conversation = convStmt.get(code);

  if (!conversation) {
    return { error: 'Conversation not found' };
  }

  if (conversation.creator_id === participantId) {
    return { error: 'Cannot join your own conversation' };
  }

  if (conversation.participant_id === participantId) {
    return { error: 'Already in this conversation' };
  }

  if (conversation.participant_id) {
    return { error: 'Conversation is full' };
  }

  const updateStmt = db.prepare(`
    UPDATE conversations SET participant_id = ? WHERE id = ?
  `);
  updateStmt.run(participantId, code);

  return { success: true, conversation: { ...conversation, participant_id: participantId } };
}

export function leaveConversation(userId, conversationId) {
  const convStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  const conversation = convStmt.get(conversationId);

  if (!conversation) {
    return { error: 'Conversation not found' };
  }

  if (conversation.creator_id !== userId && conversation.participant_id !== userId) {
    return { error: 'Not in this conversation' };
  }

  const deleteStmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  deleteStmt.run(conversationId);

  const otherUserId = conversation.creator_id === userId ? conversation.participant_id : conversation.creator_id;

  return { success: true, conversationId, otherUserId };
}

export function getUserConversations(userId) {
  const stmt = db.prepare(`
    SELECT * FROM conversations 
    WHERE creator_id = ? OR participant_id = ?
  `);
  return stmt.all(userId, userId);
}

export function getActiveConversations(userId) {
  const stmt = db.prepare(`
    SELECT * FROM conversations 
    WHERE (creator_id = ? OR participant_id = ?) AND participant_id IS NOT NULL
  `);
  return stmt.all(userId, userId);
}

export function getConversationPartnerInfo(conversationId, userId) {
  const stmt = db.prepare(`
    SELECT u.user_id, u.username, u.language FROM users u
    JOIN conversations c ON (u.user_id = c.creator_id OR u.user_id = c.participant_id)
    WHERE c.id = ? AND u.user_id != ?
  `);
  return stmt.get(conversationId, userId);
}

export default db;
