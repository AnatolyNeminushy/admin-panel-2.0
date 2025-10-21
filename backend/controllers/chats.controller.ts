
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';

/**
 * Контроллер чатов: формирует списки чатов с поиском, позволяет создавать/обновлять
 * карточки и удалять чаты с оповещением фронтенда.
 */
import pool from '../db';
import { broadcast } from '../utils/events';
import type { ChatRecord, ErrorResponse } from '../types/models';

const db = pool as unknown as Pool;

interface ChatsListQuery {
  limit?: string;
  offset?: string;
  q?: string;
}

interface ChatsListResponse {
  items: ChatListItem[];
  total: number;
}

interface ChatsUpsertBody {
  chat_id?: number | string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  platform?: string | null;
}

interface ChatListItem extends ChatRecord {
  last_ts: string | Date | null;
}

interface CountRow {
  total: number;
}

const MAX_SEARCH_LENGTH = 200;

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
};

const normalizeLimit = (value: unknown, defaultValue: number, max: number): number =>
  Math.min(toNumber(value, defaultValue), max);

const normalizeOffset = (value: unknown): number => Math.max(toNumber(value, 0), 0);

/**
 * GET /api/chats
 * • Получаем сгруппированный список чатов: собираем username/имя/фамилию/платформу и находим
 *   timestamp последнего сообщения (LEFT JOIN messages).
 * • Поисковая строка `q` работает по username, имени и фамилии (ILIKE), пагинация задаётся
 *   параметрами `limit`/`offset` с ограничениями.
 * • В заголовок `X-Total-Count` записывается общее количество чатов под фильтрами.
 */
export const list: RequestHandler<unknown, ChatsListResponse | ErrorResponse, unknown, ChatsListQuery> = async (
  req,
  res,
  next,
) => {
  const { limit = '100', offset = '0', q = '' } = req.query;

  const lim = normalizeLimit(limit, 100, 5000);
  const off = normalizeOffset(offset);
  const query = String(q ?? '').trim();

  if (query.length > MAX_SEARCH_LENGTH) {
    return res.status(400).json({ error: 'q is too long (max 200)' });
  }

  const params: Array<string | number> = [];
  let whereChats = '';
  if (query) {
    params.push(`%${query}%`);
    whereChats = `
      WHERE COALESCE(c.username, '') ILIKE $${params.length}
         OR COALESCE(c.first_name, '') ILIKE $${params.length}
         OR COALESCE(c.last_name,  '') ILIKE $${params.length}
    `;
  }

  const countSql = `
    WITH base AS (
      SELECT c.chat_id
      FROM chats c
      ${whereChats}
      GROUP BY c.chat_id
    )
    SELECT COUNT(*)::int AS total
    FROM base
  `;

  const listSql = `
    WITH base AS (
      SELECT
        c.chat_id,
        MAX(c.username)   AS username,
        MAX(c.first_name) AS first_name,
        MAX(c.last_name)  AS last_name,
        MAX(c.platform)   AS platform
      FROM chats c
      ${whereChats}
      GROUP BY c.chat_id
    ),
    last_msg AS (
      SELECT m.chat_id, MAX(m.date) AS last_ts
      FROM messages m
      GROUP BY m.chat_id
    ),
    merged AS (
      SELECT
        b.chat_id,
        b.username,
        b.first_name,
        b.last_name,
        b.platform,
        lm.last_ts
      FROM base b
      LEFT JOIN last_msg lm ON lm.chat_id = b.chat_id
    )
    SELECT
      chat_id,
      username,
      first_name,
      last_name,
      platform,
      last_ts
    FROM merged
    ORDER BY last_ts DESC NULLS LAST, chat_id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  let client: PoolClient | null = null;
  try {
    client = await db.connect();
    const [{ rows: countRows }, { rows: listRows }] = await Promise.all([
      client.query<CountRow>(countSql, params),
      client.query<ChatListItem>(listSql, [...params, lim, off]),
    ]);

    const total = countRows?.[0]?.total ?? 0;
    res.set('X-Total-Count', String(total));
    return res.json({ items: listRows, total });
  } catch (error) {
    return next(error);
  } finally {
    client?.release();
  }
};

/**
 * POST /api/chats — выполняет UPSERT: если чат существует, обновляет профиль и платформу; если нет,
 * создаёт новую запись. После операции рассылаем событие `chats:upsert`.
 */
export const createOrUpsert: RequestHandler<unknown, ChatRecord | ErrorResponse, ChatsUpsertBody> = async (
  req,
  res,
  next,
) => {
  try {
    const {
      chat_id: chatIdRaw,
      username = null,
      first_name = null,
      last_name = null,
      platform = null,
    } = req.body ?? {};

    const chatId = Number(chatIdRaw);
    if (!Number.isFinite(chatId)) {
      return res.status(400).json({ error: 'chat_id (number) is required' });
    }

    const sql = `
      INSERT INTO chats (chat_id, username, first_name, last_name, platform)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (chat_id) DO UPDATE SET
        username   = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        platform   = EXCLUDED.platform
      RETURNING chat_id, username, first_name, last_name, platform
    `;

    const { rows } = await db.query<ChatRecord>(sql, [
      chatId,
      username,
      first_name,
      last_name,
      platform,
    ]);

    const row = rows[0];
    broadcast('chats', { action: 'upsert', row });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/chats/:chat_id — частично обновляет запись чата. Возвращаем обновлённые данные
 * и отправляем событие `chats:update`.
 */
export const update: RequestHandler<
  { chat_id: string },
  ChatRecord | ErrorResponse,
  ChatsUpsertBody
> = async (req, res, next) => {
  try {
    const chatId = Number(req.params.chat_id);
    if (!Number.isFinite(chatId)) {
      return res.status(400).json({ error: 'chat_id must be number' });
    }

    const {
      username = null,
      first_name = null,
      last_name = null,
      platform = null,
    } = req.body ?? {};

    const sql = `
      UPDATE chats
      SET
        username   = $2,
        first_name = $3,
        last_name  = $4,
        platform   = $5
      WHERE chat_id = $1
      RETURNING chat_id, username, first_name, last_name, platform
    `;

    const { rows } = await db.query<ChatRecord>(sql, [
      chatId,
      username,
      first_name,
      last_name,
      platform,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = rows[0];
    broadcast('chats', { action: 'update', row });
    return res.json(row);
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /api/chats/:chat_id — удаляет чат. Сообщения каскадно удалит СУБД (ON DELETE CASCADE).
 * После удаления шлём событие `chats:delete`, ответ — 204 No Content.
 */
export const remove: RequestHandler<{ chat_id: string }, void | ErrorResponse> = async (
  req,
  res,
  next,
) => {
  try {
    const chatId = Number(req.params.chat_id);
    if (!Number.isFinite(chatId)) {
      return res.status(400).json({ error: 'chat_id must be number' });
    }

    const result = await db.query('DELETE FROM chats WHERE chat_id = $1', [chatId]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Not found' });
    }

    broadcast('chats', { action: 'delete', chat_id: chatId });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};
