import type { RequestHandler } from "express";
import type { Pool } from "pg";

/**
 * Контроллер броней: управляет выборкой, созданием, обновлением и удалением записей
 * таблицы reservations. Маршруты /api/reserves используют эти обработчики.
 */
import pool from "../db";
import { broadcast } from "../utils/events";
import { normalizeTimeInput } from "../utils/time";
import type { ErrorResponse, ReservationRecord } from "../types/models";

const db = pool as unknown as Pool;

interface ReservesListQuery {
  table?: string;
  limit?: string;
  offset?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  min_guests?: string;
  max_guests?: string;
}

interface ReserveShortItem {
  guest_name: string | null;
  total_amount: number;
  date: Date | string;
  time: string | null;
  created_at: Date | string;
}

interface ReservesShortResponse {
  items: ReserveShortItem[];
}

interface ReservesTableResponse {
  items: ReservationRecord[];
  total: number;
}

interface CountRow {
  total: number;
  cnt?: number;
}

interface ReservationCreateBody {
  tg_username?: string | null;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  date?: string | null;
  time?: string | null;
  guests?: number | string | null;
  comment?: string | null;
  platform?: string | null;
}

type ReservationUpdateBody = ReservationCreateBody;

type ReservesListResponse = ReservesShortResponse | ReservesTableResponse;

type QueryParam = string | number | Date | null;

const toSafeGuests = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    return NaN;
  }
  return Math.trunc(num);
};

/**
 * GET /api/reserves
 * • Компактный режим: если параметр `table` отсутствует или не равен 1 — отдаёт последние брони,
 *   что используется для карточек аналитики. `limit` ограничивает выборку (до 5000 записей).
 * • Табличный режим (`table=1`): поддерживает поисковую строку `q`, диапазон дат (`date_from`, `date_to`),
 *   фильтр по количеству гостей (`min_guests`, `max_guests`) и пагинацию.
 * • Заголовок `X-Total-Count` сообщает общее количество броней под активными фильтрами.
 */
export const list: RequestHandler<
  unknown,
  ReservesListResponse | ErrorResponse,
  unknown,
  ReservesListQuery
> = async (req, res) => {
  try {
    if (String(req.query.table ?? "") !== "1") {
      const limit = Math.min(parseInt(req.query.limit ?? "100", 10), 5000);
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

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      params.push(limit);

      const sql = `
        SELECT
          name AS guest_name,
          0 AS total_amount,
          COALESCE(date::timestamp, created_at) AS date,
          time,
          created_at
        FROM reservations
        ${where}
        ORDER BY COALESCE(date, created_at::date) DESC, created_at DESC
        LIMIT $${params.length}
      `;
      const { rows } = await db.query<ReserveShortItem>(sql, params);
      return res.json({ items: rows });
    }

    const { limit = "50", offset = "0" } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 1000);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const params: QueryParam[] = [];
    let where = "";

    const qRaw = (req.query.q ?? "").toString().trim();
    const q = qRaw.length > 200 ? qRaw.slice(0, 200) : qRaw;

    if (q) {
      const base = params.length;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      where +=
        (where ? " AND " : " WHERE ") +
        `
        (
          COALESCE(tg_username, '') ILIKE $${base + 1}
          OR COALESCE(name, '') ILIKE $${base + 2}
          OR COALESCE(phone, '') ILIKE $${base + 3}
          OR COALESCE(address, '') ILIKE $${base + 4}
        )
      `;
    }

    const { date_from, date_to, min_guests, max_guests } = req.query;

    if (date_from) {
      params.push(date_from);
      where +=
        (where ? " AND " : " WHERE ") + `COALESCE(date, created_at::date) >= $${params.length}`;
    }
    if (date_to) {
      params.push(date_to);
      where +=
        (where ? " AND " : " WHERE ") + `COALESCE(date, created_at::date) <= $${params.length}`;
    }

    if (min_guests !== undefined && min_guests !== "" && !Number.isNaN(Number(min_guests))) {
      params.push(Number(min_guests));
      where += (where ? " AND " : " WHERE ") + `COALESCE(guests, 0) >= $${params.length}`;
    }
    if (max_guests !== undefined && max_guests !== "" && !Number.isNaN(Number(max_guests))) {
      params.push(Number(max_guests));
      where += (where ? " AND " : " WHERE ") + `COALESCE(guests, 0) <= $${params.length}`;
    }

    const totalSql = `SELECT COUNT(*)::int AS total FROM reservations ${where}`;
    const totalRows = await db.query<CountRow>(totalSql, params);
    const total = totalRows.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT
        id, tg_username, name, phone, address, date, time, guests, comment, platform, created_at
      FROM reservations
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const dataRows = await db.query<ReservationRecord>(dataSql, [...params, lim, off]);

    res.set("X-Total-Count", String(total));
    return res.json({ items: dataRows.rows, total });
  } catch (error) {
    console.error("RESERVES LIST ERROR:", error);
    return res.status(500).json({ error: "Internal error" });
  }
};

/**
 * POST /api/reserves
 * • Создаёт новую запись: устанавливает дату создания NOW(), валидирует количество гостей
 *   (неотрицательное число) и сохраняет контактную информацию.
 * • После вставки рассылается событие `reservations:create`.
 */
export const create: RequestHandler<
  unknown,
  ReservationRecord | ErrorResponse,
  ReservationCreateBody
> = async (req, res) => {
  try {
    const {
      tg_username = null,
      name = null,
      phone = null,
      address = null,
      date = null,
      time = null,
      guests = null,
      comment = null,
      platform = null,
    } = req.body ?? {};

    const normalizedGuests = toSafeGuests(guests);
    if (Number.isNaN(normalizedGuests)) {
      return res.status(400).json({ error: "guests must be a non-negative number" });
    }

    const normalizedTime = normalizeTimeInput(time);

    const sql = `
      INSERT INTO reservations
        (tg_username, name, phone, address, date, time, guests, comment, platform, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING
        id, tg_username, name, phone, address, date, time, guests, comment, platform, created_at
    `;

    const { rows } = await db.query<ReservationRecord>(sql, [
      tg_username,
      name,
      phone,
      address,
      date,
      normalizedTime,
      normalizedGuests,
      comment,
      platform,
    ]);

    const row = rows[0];
    broadcast("reservations", { action: "create", row });
    return res.json(row);
  } catch (error) {
    console.error("RESERVES CREATE ERROR:", error);
    return res.status(500).json({ error: "Internal error" });
  }
};

/**
 * PUT /api/reserves/:id
 * • Частично обновляет бронь: каждое поле берёт новое значение, если оно передано; количество гостей
 *   дополнительно проверяется на корректность.
 * • При успехе публикуется событие `reservations:update` с обновлённой записью.
 */
export const update: RequestHandler<
  { id: string },
  ReservationRecord | ErrorResponse,
  ReservationUpdateBody
> = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id must be number" });
    }

    const {
      tg_username = null,
      name = null,
      phone = null,
      address = null,
      date = null,
      time = null,
      guests = null,
      comment = null,
      platform = null,
    } = req.body ?? {};

    const normalizedGuests = guests === undefined ? null : toSafeGuests(guests);
    if (normalizedGuests !== null && Number.isNaN(normalizedGuests)) {
      return res.status(400).json({ error: "guests must be a non-negative number" });
    }

    const normalizedTime = time === null ? null : normalizeTimeInput(time);

    const sql = `
      UPDATE reservations SET
        tg_username = COALESCE($2, tg_username),
        name        = COALESCE($3, name),
        phone       = COALESCE($4, phone),
        address     = COALESCE($5, address),
        date        = COALESCE($6, date),
        time        = COALESCE($7, time),
        guests      = COALESCE($8, guests),
        comment     = COALESCE($9, comment),
        platform    = COALESCE($10, platform)
      WHERE id = $1
      RETURNING id, tg_username, name, phone, address, date, time, guests, comment, platform, created_at
    `;

    const { rows } = await db.query<ReservationRecord>(sql, [
      id,
      tg_username,
      name,
      phone,
      address,
      date,
      normalizedTime,
      normalizedGuests,
      comment,
      platform,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    const row = rows[0];
    broadcast("reservations", { action: "update", row });
    return res.json(row);
  } catch (error) {
    console.error("RESERVES UPDATE ERROR:", error);
    return res.status(500).json({ error: "Internal error" });
  }
};

/**
 * DELETE /api/reserves/:id
 * • Удаляет бронь по идентификатору. Если запись найдена — в ответ { ok: true, id }
 * • Посылает событие `reservations:delete`, чтобы клиенты обновили таблицы.
 */
export const remove: RequestHandler<
  { id: string },
  { ok: true; id: number } | ErrorResponse
> = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id must be number" });
    }

    const result = await db.query("DELETE FROM reservations WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Not found" });
    }

    broadcast("reservations", { action: "delete", id });
    return res.json({ ok: true, id });
  } catch (error) {
    console.error("RESERVES REMOVE ERROR:", error);
    return res.status(500).json({ error: "Internal error" });
  }
};
