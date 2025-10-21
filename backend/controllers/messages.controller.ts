
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

/**
 * Контроллер сообщений: обрабатывает историю чатов, вебхуки входящих, обновление
 * и удаление сообщений, а также уведомляет SSE-подписчиков.
 */
import pool from '../db';
import { broadcast } from '../utils/events';
import type { ErrorResponse, MessageRecord } from '../types/models';

const db = pool as unknown as Pool;

interface MessagesListQuery {
  table?: string;
  limit?: string;
  offset?: string;
  chatId?: string;
  q?: string;
}

interface MessageTableRow extends MessageRecord {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  platform: string | null;
}

interface MessagesTableResponse {
  items: MessageTableRow[];
  total: number;
}

interface CountRow {
  cnt: number;
}

interface MessageCreateRawBody {
  chat_id?: number | string;
  text?: string;
  from_me?: boolean;
  date?: string | null;
}

interface MessageDeleteResponse {
  ok: true;
  id: number;
}

type MessagesListResponse = MessageRecord[] | MessagesTableResponse;

type MessagesUpdateBody = {
  text?: string | null;
  from_me?: boolean | null;
  date?: string | null;
};

const isValidChatId = (value: unknown): value is number => {
  const num = Number(value);
  return Number.isFinite(num);
};

const normalizeBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

/**
 * GET /messages
 * • Диалоговый режим: при отсутствии `table=1` требуется параметр `chatId` — возвращаем хронологический
 *   список сообщений этого чата (используется пагинация `limit/offset`).
 * • Табличный режим (`table=1`): позволяет искать по тексту сообщения и по имени/username собеседника,
 *   отдаёт дополнительные поля чата и заголовок `X-Total-Count` для пагинации администратора.
 */
export const list: RequestHandler<
  unknown,
  MessagesListResponse | ErrorResponse,
  unknown,
  MessagesListQuery
> = async (req, res) => {
  try {
    const tableMode = String(req.query.table ?? '') === '1';

    if (!tableMode) {
      if (!isValidChatId(req.query.chatId)) {
        return res.status(400).json({ error: 'chatId is required and must be a number' });
      }

      const chatId = Number(req.query.chatId);
      const { limit = '500', offset = '0' } = req.query;
      const lim = Math.min(parseInt(limit, 10) || 500, 1000);
      const off = Math.max(parseInt(offset, 10) || 0, 0);

      const sql = `
        SELECT * FROM (
          SELECT id, chat_id, from_me, text, date
          FROM messages
          WHERE chat_id = $1
          ORDER BY date DESC, id DESC
          LIMIT $2 OFFSET $3
        ) t
        ORDER BY date ASC, id ASC
      `;
      const { rows } = await db.query<MessageRecord>(sql, [chatId, lim, off]);
      return res.json(rows);
    }

    const { limit = '50', offset = '0', q = '' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 1000);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const params: Array<string | number> = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      where = `
        WHERE m.text ILIKE $1
           OR c.username ILIKE $2
           OR CONCAT(COALESCE(c.first_name,''), ' ', COALESCE(c.last_name,'')) ILIKE $3
      `;
    }

    const totalSql = `
      SELECT COUNT(*)::int AS cnt
      FROM messages m
      LEFT JOIN chats c ON c.chat_id = m.chat_id
      ${where}
    `;
    const totalRows = await db.query<CountRow>(totalSql, params);
    const total = totalRows.rows[0]?.cnt ?? 0;

    const dataSql = `
      SELECT
        m.id,
        m.chat_id,
        m.from_me,
        m.text,
        m.date,
        c.username,
        c.first_name,
        c.last_name,
        c.platform
      FROM messages m
      LEFT JOIN chats c ON c.chat_id = m.chat_id
      ${where}
      ORDER BY m.date DESC, m.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataRows = await db.query<MessageTableRow>(dataSql, [...params, lim, off]);

    res.set('X-Total-Count', String(total));
    return res.json({ items: dataRows.rows, total });
  } catch (err) {
    console.error('MESSAGES LIST ERROR:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * POST /messages/raw — регистрирует входящее сообщение (например, из вебхука или импорта).
 * Если дата не передана, ставим текущее время. После вставки уведомляем клиентов (`messages:create`).
 */
export const createRaw: RequestHandler<
  unknown,
  MessageRecord | ErrorResponse,
  MessageCreateRawBody
> = async (req, res) => {
  try {
    const { chat_id, text, from_me = false, date = null } = req.body ?? {};

    if (!isValidChatId(chat_id) || !text) {
      return res.status(400).json({ error: 'chat_id and text are required' });
    }

    const sql = `
      INSERT INTO messages (chat_id, from_me, text, date)
      VALUES ($1, $2, $3, COALESCE($4, NOW()))
      RETURNING id, chat_id, from_me, text, date
    `;
    const { rows } = await db.query<MessageRecord>(sql, [
      Number(chat_id),
      Boolean(from_me),
      String(text),
      date,
    ]);

    const row = rows[0];
    broadcast('messages', { action: 'create', row });
    return res.json(row);
  } catch (err) {
    console.error('CREATE MESSAGE ERROR:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * PATCH /messages/:id — частично обновляет сообщение: можно изменить текст, флаг `from_me` или дату.
 * После обновления рассылается событие `messages:update`.
 */
export const update: RequestHandler<
  { id: string },
  MessageRecord | ErrorResponse,
  MessagesUpdateBody
> = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'id must be number' });
    }

    const { text = null, from_me = null, date = null } = req.body ?? {};
    const normalizedFromMe = normalizeBoolean(from_me);

    const sql = `
      UPDATE messages
      SET
        text = COALESCE($2, text),
        from_me = COALESCE($3, from_me),
        date = COALESCE($4, date)
      WHERE id = $1
      RETURNING id, chat_id, from_me, text, date
    `;
    const params = [
      id,
      text,
      normalizedFromMe,
      date,
    ];

    const { rows } = await db.query<MessageRecord>(sql, params);

    if (!rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = rows[0];
    broadcast('messages', { action: 'update', row });
    return res.json(row);
  } catch (err) {
    console.error('UPDATE MESSAGE ERROR:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * DELETE /messages/:id — удаляет сообщение. При успехе отправляем событие `messages:delete`,
 * чтобы таблицы/диалоги на фронте обновились.
 */
export const remove: RequestHandler<{ id: string }, MessageDeleteResponse | ErrorResponse> = async (
  req,
  res,
) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'id must be a number' });
    }

    const result = await db.query('DELETE FROM messages WHERE id = $1', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Not found' });
    }

    broadcast('messages', { action: 'delete', id });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('REMOVE MESSAGE ERROR:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
