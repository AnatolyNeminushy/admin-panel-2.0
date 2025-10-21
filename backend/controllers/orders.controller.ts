
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

/**
 * Контроллер заказов: отвечает за список, создание, обновление и удаление записей
 * таблицы orders. Используется маршрутом /api/orders и публикует события через broadcast.
 */
import pool from '../db';
import { broadcast } from '../utils/events';
import { normalizeTimeInput } from '../utils/time';
import type { ErrorResponse, OrderRecord } from '../types/models';

const db = pool as unknown as Pool;

interface OrdersListQuery {
  table?: string;
  limit?: string;
  offset?: string;
  q?: string;
  platform?: string;
  order_type?: string;
  date_from?: string;
  date_to?: string;
  min_total?: string;
  max_total?: string;
}

interface OrdersShortItem {
  guest_name: string | null;
  total_amount: number | null;
  date: Date | string;
  time: string | null;
  created_at: Date | string;
}

interface OrdersShortResponse {
  items: OrdersShortItem[];
}

interface OrdersTableResponse {
  items: OrderRecord[];
  total: number;
}

interface CountRow {
  cnt: number;
}

interface OrderCreateBody {
  tg_username?: string | null;
  name?: string | null;
  phone?: string | null;
  order_type?: string | null;
  date?: string | null;
  time?: string | null;
  address?: string | null;
  items?: unknown;
  total?: number | string | null;
  comment?: string | null;
  platform?: string | null;
}

interface OrderDeleteResponse {
  ok: true;
  id: number;
}

type OrdersListResponse = OrdersShortResponse | OrdersTableResponse;

type OrderUpdateBody = OrderCreateBody;

type QueryParam = string | number | Date;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * GET /api/orders
 * • Если параметр `table` не равен 1 — возвращает компактный список последних заказов
 *   (используется для аналитических карточек). Параметр `limit` ограничивает выборку (до 5000).
 * • Если `table=1` — включается табличный режим с поддержкой полнотекстового поиска (`q`),
 *   фильтров по платформе, типу, датам и сумме заказа. Пагинация управляется `limit` и `offset`.
 * • В табличном режиме заголовок `X-Total-Count` сообщает общее число записей под фильтрами.
 */
export const list: RequestHandler<
  unknown,
  OrdersListResponse | ErrorResponse,
  unknown,
  OrdersListQuery
> = async (req, res) => {
  try {
    if (String(req.query.table ?? '') !== '1') {
      const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 5000);
      const params: QueryParam[] = [];
      const filters: string[] = [];

      const { date_from, date_to } = req.query;

      if (date_from) {
        params.push(date_from);
        filters.push(`COALESCE(date, created_at::date) >= $${params.length}`);
      }

      if (date_to) {
        params.push(date_to);
        filters.push(`COALESCE(date, created_at::date) <= $${params.length}`);
      }

      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

      params.push(limit);

      const sql = `
        SELECT
          name AS guest_name,
          COALESCE(total, 0) AS total_amount,
          COALESCE(date::timestamp, created_at) AS date,
          time,
          created_at
        FROM orders
        ${where}
        ORDER BY COALESCE(date, created_at::date) DESC, created_at DESC
        LIMIT $${params.length}
      `;
      const { rows } = await db.query<OrdersShortItem>(sql, params);
      return res.json({ items: rows });
    }

    const { limit = '50', offset = '0', q = '' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 1000);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const params: QueryParam[] = [];
    let where = '';

    if (q) {
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      where +=
        (where ? ' AND ' : ' WHERE ') +
        `
        (
          COALESCE(tg_username, '') ILIKE $${params.length - 4}
          OR COALESCE(name, '') ILIKE $${params.length - 3}
          OR COALESCE(phone, '') ILIKE $${params.length - 2}
          OR COALESCE(address, '') ILIKE $${params.length - 1}
          OR COALESCE(comment, '') ILIKE $${params.length}
        )
      `;
    }

    const { platform, order_type, date_from, date_to, min_total, max_total } = req.query;

    if (platform) {
      params.push(String(platform).toLowerCase());
      where += (where ? ' AND ' : ' WHERE ') + `LOWER(COALESCE(platform, '')) = $${params.length}`;
    }
    if (order_type) {
      params.push(String(order_type).toLowerCase());
      where += (where ? ' AND ' : ' WHERE ') + `LOWER(COALESCE(order_type, '')) = $${params.length}`;
    }
    if (date_from) {
      params.push(date_from);
      where += (where ? ' AND ' : ' WHERE ') + `COALESCE(date, created_at::date) >= $${params.length}`;
    }
    if (date_to) {
      params.push(date_to);
      where += (where ? ' AND ' : ' WHERE ') + `COALESCE(date, created_at::date) <= $${params.length}`;
    }
    if (min_total !== undefined && min_total !== '' && !Number.isNaN(Number(min_total))) {
      params.push(Number(min_total));
      where += (where ? ' AND ' : ' WHERE ') + `COALESCE(total, 0) >= $${params.length}`;
    }
    if (max_total !== undefined && max_total !== '' && !Number.isNaN(Number(max_total))) {
      params.push(Number(max_total));
      where += (where ? ' AND ' : ' WHERE ') + `COALESCE(total, 0) <= $${params.length}`;
    }

    const totalSql = `SELECT COUNT(*)::int AS cnt FROM orders ${where}`;
    const totalRows = await db.query<CountRow>(totalSql, params);
    const total = totalRows.rows[0]?.cnt ?? 0;

    const dataSql = `
      SELECT
        id, tg_username, name, phone, order_type, date, time,
        address, items, total, comment, platform, created_at
      FROM orders
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const dataRows = await db.query<OrderRecord>(dataSql, [...params, lim, off]);

    res.set('X-Total-Count', String(total));
    return res.json({ items: dataRows.rows, total });
  } catch (error) {
    console.error('ORDERS LIST ERROR:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * POST /api/orders
 * • Принимает поля заказа (контактные данные, сумму, состав и т.д.)
 * • Сервер автоматически выставляет `created_at = NOW()`
 * • После успешной вставки отправляется событие `orders:create`, чтобы клиенты обновили список
 */
export const create: RequestHandler<unknown, OrderRecord | ErrorResponse, OrderCreateBody> = async (
  req,
  res,
) => {
  try {
    const {
      tg_username = null,
      name = null,
      phone = null,
      order_type = null,
      date = null,
      time = null,
      address = null,
      items = null,
      total = null,
      comment = null,
      platform = null,
    } = req.body ?? {};

    const normalizedTime = normalizeTimeInput(time);

    const sql = `
      INSERT INTO orders
        (tg_username, name, phone, order_type, date, time, address, items, total, comment, platform, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING
        id, tg_username, name, phone, order_type, date, time, address, items, total, comment, platform, created_at
    `;

    const { rows } = await db.query<OrderRecord>(sql, [
      tg_username,
      name,
      phone,
      order_type,
      date,
      normalizedTime,
      address,
      items,
      total,
      comment,
      platform,
    ]);

    const row = rows[0];
    broadcast('orders', { action: 'create', row });
    return res.json(row);
  } catch (error) {
    console.error('ORDERS CREATE ERROR:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * PUT /api/orders/:id
 * • Выполняет частичное обновление: для каждого поля заказа используется COALESCE,
 *   поэтому можно изменять лишь часть информации.
 * • При успешном обновлении публикуется событие `orders:update` с обновлённой записью.
 */
export const update: RequestHandler<
  { id: string },
  OrderRecord | ErrorResponse,
  OrderUpdateBody
> = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'id must be number' });
    }

    const {
      tg_username = null,
      name = null,
      phone = null,
      order_type = null,
      date = null,
      time = null,
      address = null,
      items = null,
      total = null,
      comment = null,
      platform = null,
    } = req.body ?? {};

    const normalizedTime = time === null ? null : normalizeTimeInput(time);

    const sql = `
      UPDATE orders SET
        tg_username = COALESCE($2, tg_username),
        name        = COALESCE($3, name),
        phone       = COALESCE($4, phone),
        order_type  = COALESCE($5, order_type),
        date        = COALESCE($6, date),
        time        = COALESCE($7, time),
        address     = COALESCE($8, address),
        items       = COALESCE($9, items),
        total       = COALESCE($10, total),
        comment     = COALESCE($11, comment),
        platform    = COALESCE($12, platform)
      WHERE id = $1
      RETURNING
        id, tg_username, name, phone, order_type, date, time, address, items, total, comment, platform, created_at
    `;

    const { rows } = await db.query<OrderRecord>(sql, [
      id,
      tg_username,
      name,
      phone,
      order_type,
      date,
      normalizedTime,
      address,
      items,
      total,
      comment,
      platform,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = rows[0];
    broadcast('orders', { action: 'update', row });
    return res.json(row);
  } catch (error) {
    console.error('ORDERS UPDATE ERROR:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * DELETE /api/orders/:id
 * • Удаляет заказ по идентификатору
 * • При успехе триггерит событие `orders:delete`, после чего клиенты убирают запись из таблиц
 */
export const remove: RequestHandler<{ id: string }, OrderDeleteResponse | ErrorResponse> = async (
  req,
  res,
) => {
  try {
    const id = Number(req.params.id);
    if (!isFiniteNumber(id)) {
      return res.status(400).json({ error: 'id must be number' });
    }

    const result = await db.query('DELETE FROM orders WHERE id = $1', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Not found' });
    }

    broadcast('orders', { action: 'delete', id });
    return res.json({ ok: true, id });
  } catch (error) {
    console.error('ORDERS DELETE ERROR:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};
