
// Сервис массовых рассылок (Telegram / VK) с мягким троттлингом и логированием отправленных сообщений.

const pool = require('../db');
const { normalizePlatform, variantsFor } = require('../utils/platform');

// Node 18+ имеет глобальный fetch. Проверяем и подсказываем, если окружение старое.
const fetch = globalThis.fetch;
if (!fetch) {
  throw new Error(
    'Global fetch is not available. Use Node 18+ or polyfill (e.g., node-fetch).',
  );
}

// Подгружаем локальные адаптеры, если они есть.
// Они позволяют отправлять через локальные функции; иначе падаем на REST API.
let tg = {};
let vk = {};
try {
  tg = require('./telegram.service');
} catch {
  /* noop */
}
try {
  vk = require('./vk.service');
} catch {
  /* noop */
}

// Мягкий троттлинг, чтобы не словить лимиты.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Утилиты форматирования ---------- */

/**
 * Безопасно экранирует HTML-спецсимволы в строке.
 */
const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Формирует HTML-сообщение для Telegram: <b>title</b>\ntext
 */
const buildMessage = (title, text) => {
  const t = (title || '').trim();
  const msg = (text || '').trim();
  if (t && msg) return `<b>${escapeHtml(t)}</b>\n${escapeHtml(msg)}`;
  if (t) return `<b>${escapeHtml(t)}</b>`;
  return escapeHtml(msg);
};

/**
 * Текст, сохраняемый в БД (без HTML). Удобно для админ-лога.
 */
const buildLogText = ({ title, text, imageUrl }) => {
  const t = (title || '').trim();
  const msg = (text || '').trim();
  const lines = [];
  if (t) lines.push(t);
  if (msg) lines.push(msg);
  if (imageUrl) lines.push(`📷 ${imageUrl}`);
  return lines.join('\n\n');
};

/**
 * УПРОЩЁННАЯ ВЫБОРКА ПОЛУЧАТЕЛЕЙ.
 * Ожидаем таблицу chats(chat_id, platform, ...).
 * Здесь применяем только фильтр по платформе и limit. Остальные фильтры — в планах.
 */
async function selectRecipients({ filters, platforms, limit }) {
  const params = [];
  const where = [];

  // Фильтр по платформе из filters.platform (tg/vk) или чекбоксов platforms.
  if (filters?.platform && filters.platform !== 'any') {
    const arr = variantsFor(filters.platform).map((s) => s.toLowerCase());
    params.push(arr);
    where.push(`LOWER(platform) = ANY($${params.length})`);
  } else if (Array.isArray(platforms) && platforms.length) {
    const arr = platforms.flatMap(variantsFor).map((s) => s.toLowerCase());
    params.push(arr);
    where.push(`LOWER(platform) = ANY($${params.length})`);
  }

  let sql = `
    SELECT chat_id, platform
    FROM chats
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY chat_id DESC
  `;
  if (limit && Number(limit) > 0) {
    params.push(Number(limit));
    sql += ` LIMIT $${params.length}`;
  }

  const { rows } = await pool.query(sql, params);
  return rows;
}

/** Отправка в Telegram (через локальный адаптер или напрямую Bot API) */
async function sendTelegram(chatId, { title, text, imageUrl }) {
  if (tg?.sendMessageOrPhoto) {
    const message = buildMessage(title, text);
    return tg.sendMessageOrPhoto(chatId, {
      text: message,
      imageUrl,
      parse_mode: 'HTML',
    });
  }
  if (tg?.sendMessage) {
    const message = buildMessage(title, text);
    return tg.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }

  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TG_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TG_TOKEN;

  if (!token) throw new Error('TG_BOT_TOKEN is not set');

  const message = buildMessage(title, text);

  if (imageUrl) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: imageUrl,
        caption: message,
        parse_mode: 'HTML',
      }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || 'tg sendPhoto failed');
    return j;
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'tg sendMessage failed');
  return j;
}

/** Отправка во VK (через локальный адаптер или напрямую messages.send) */
async function sendVK(userId, { title, text, imageUrl }) {
  const message = (title ? `${title}\n\n` : '') + (text || '');

  if (vk?.sendMessageSimple) {
    return vk.sendMessageSimple(userId, { text: message, imageUrl });
  }
  if (vk?.sendMessage) {
    return vk.sendMessage(userId, message);
  }

  const token = process.env.VK_GROUP_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  if (!token || !groupId) throw new Error('VK credentials not set');

  const url = 'https://api.vk.com/method/messages.send?v=5.199';
  const params = new URLSearchParams({
    access_token: token,
    random_id: Math.floor(Math.random() * 1e12).toString(),
    user_id: String(userId),
    message,
    group_id: String(groupId),
  });

  const r = await fetch(url, { method: 'POST', body: params });
  const j = await r.json();
  if (j.error) throw new Error(j.error.error_msg || 'vk send failed');
  return j;
}

/**
 * Отправляет сообщение одному получателю в зависимости от платформы.
 */
async function sendOne(recipient, payload) {
  const plat = normalizePlatform(recipient.platform); // 'telegram' → 'tg', 'vk' → 'vk'
  if (plat === 'tg') return sendTelegram(recipient.chat_id, payload);
  if (plat === 'vk') return sendVK(recipient.chat_id, payload);
  throw new Error(`Unsupported platform: ${recipient.platform}`);
}

/**
 * Публичная выборка без отправки (для предпросмотра списка получателей).
 */
async function previewRecipients({ filters, platforms, limit }) {
  const rows = await selectRecipients({
    filters: filters || { onlyActiveDays: 90, minOrders: 0, platform: 'any' },
    platforms:
      Array.isArray(platforms) && platforms.length ? platforms : ['tg', 'vk'],
    limit: Number(limit) || 200,
  });
  return rows || [];
}

/**
 * Основной пайплайн рассылки.
 * mode:
 *  - 'all'      — всем по фильтрам
 *  - 'limit'    — первым N по фильтрам (используется limit)
 *  - 'selected' — конкретным chat_id (recipientIds)
 */
async function runBroadcast({
  title = 'Без названия',
  text = '',
  imageUrl = null,
  platforms = ['tg'],
  filters = { onlyActiveDays: 90, minOrders: 0, platform: 'any' },
  testMode = true,
  mode = 'all',
  limit = null,
  recipientIds = [],
}) {
  const allowed = ['tg', 'vk'];
  const plats = platforms.map(normalizePlatform).filter((p) => allowed.includes(p));
  if (!plats.length) {
    return {
      error: 'Не выбрана платформа',
      testMode,
      total: 0,
      sent: 0,
      failed: 0,
      items: [],
      mode,
    };
  }

  let recipients = [];
  if (mode === 'selected' && Array.isArray(recipientIds) && recipientIds.length) {
    const { rows } = await pool.query(
      `
        SELECT chat_id, platform
        FROM chats
        WHERE chat_id::text = ANY($1::text[])
      `,
      [recipientIds.map(String)],
    );
    recipients = rows;
  } else {
    const lim = mode === 'limit' ? Number(limit) || null : null;
    recipients = await selectRecipients({
      filters,
      platforms: plats,
      limit: lim,
    });
  }

  const result = {
    title,
    testMode,
    total: recipients.length,
    sent: 0,
    failed: 0,
    items: [],
    mode,
  };

  if (testMode || !recipients.length) {
    // В тестовом режиме возвращаем только счётчики (без реальных отправок)
    return result;
  }

  const payload = {
    title: String(title || ''),
    text: String(text || ''),
    imageUrl: imageUrl || null,
  };

  // Простая поштучная отправка с паузой (минимизируем риски лимитов)
  for (const r of recipients) {
    try {
      await sendOne(r, payload);

      // Пишем в БД, чтобы сообщение появилось в админ-чате
      await pool.query(
        `
          INSERT INTO messages (chat_id, from_me, text, date)
          VALUES ($1, $2, $3, NOW())
        `,
        [r.chat_id, true, buildLogText(payload)],
      );

      result.sent += 1;
      result.items.push({ chat_id: r.chat_id, platform: r.platform, ok: true });
    } catch (e) {
      result.failed += 1;
      result.items.push({
        chat_id: r.chat_id,
        platform: r.platform,
        ok: false,
        detail: e?.message || 'send failed',
      });
    }
    await sleep(350);
  }

  return result;
}

module.exports = { runBroadcast, previewRecipients };
