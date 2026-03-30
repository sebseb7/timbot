import sqlite3 from 'sqlite3';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { DISABLE_RECEIVE_AUDIO } from './config.js';

mkdirSync('./data', { recursive: true });
const db = new sqlite3.Database('./data/bot.db');

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Promisify database operations
const dbRun = (sql, params = []) => 
  new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      language TEXT DEFAULT 'en',
      output TEXT DEFAULT 'text'
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      creator_id INTEGER,
      participant_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

export async function getOrCreateUser(userId, username, languageCode = 'en', firstName = null) {
  let user = await dbGet('SELECT * FROM users WHERE user_id = ?', [userId]);

  if (!user) {
    const name = username ? `@${username}` : (firstName || null);
    await dbRun('INSERT INTO users (user_id, username, language, output) VALUES (?, ?, ?, ?)',
      [userId, name, languageCode, 'text']);
    user = { user_id: userId, username: name, language: languageCode, output: 'text' };
  } else if (!user.username && (username || firstName)) {
    const name = username ? `@${username}` : firstName;
    await dbRun('UPDATE users SET username = ? WHERE user_id = ?', [name, userId]);
    user.username = name;
  }

  return user;
}

export async function setUserLanguage(userId, language) {
  await dbRun('UPDATE users SET language = ? WHERE user_id = ?', [language, userId]);
}

export async function getUserLanguage(userId) {
  const row = await dbGet('SELECT language FROM users WHERE user_id = ?', [userId]);
  return row ? row.language : 'en';
}

export async function setUserOutput(userId, output) {
  await dbRun('UPDATE users SET output = ? WHERE user_id = ?', [output, userId]);
}

export async function getUserOutput(userId) {
  if (DISABLE_RECEIVE_AUDIO) {
    return 'text';
  }
  const row = await dbGet('SELECT output FROM users WHERE user_id = ?', [userId]);
  return row ? row.output : 'text';
}

export async function createConversation(creatorId) {
  const code = randomBytes(4).toString('hex').toUpperCase();
  await dbRun('INSERT INTO conversations (id, creator_id) VALUES (?, ?)', [code, creatorId]);
  return code;
}

export async function joinConversation(code, participantId) {
  const conversation = await dbGet('SELECT * FROM conversations WHERE id = ?', [code]);

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

  await dbRun('UPDATE conversations SET participant_id = ? WHERE id = ?', [participantId, code]);

  return { success: true, conversation: { ...conversation, participant_id: participantId } };
}

export async function leaveConversation(userId, conversationId) {
  const conversation = await dbGet('SELECT * FROM conversations WHERE id = ?', [conversationId]);

  if (!conversation) {
    return { error: 'Conversation not found' };
  }

  if (conversation.creator_id !== userId && conversation.participant_id !== userId) {
    return { error: 'Not in this conversation' };
  }

  await dbRun('DELETE FROM conversations WHERE id = ?', [conversationId]);

  const otherUserId = conversation.creator_id === userId ? conversation.participant_id : conversation.creator_id;

  return { success: true, conversationId, otherUserId };
}

export async function getUserConversations(userId) {
  return await dbAll(`
    SELECT * FROM conversations 
    WHERE creator_id = ? OR participant_id = ?
  `, [userId, userId]);
}

export async function getActiveConversations(userId) {
  return await dbAll(`
    SELECT * FROM conversations 
    WHERE (creator_id = ? OR participant_id = ?) AND participant_id IS NOT NULL
  `, [userId, userId]);
}

export async function getConversationPartnerInfo(conversationId, userId) {
  return await dbGet(`
    SELECT u.user_id, u.username, u.language FROM users u
    JOIN conversations c ON (u.user_id = c.creator_id OR u.user_id = c.participant_id)
    WHERE c.id = ? AND u.user_id != ?
  `, [conversationId, userId]);
}

export default db;
