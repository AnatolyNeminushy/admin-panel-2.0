
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

/**
 * Расширенный контроллер статистики: собирает агрегированные показатели по заказам и бронам,
 * используемые в виджетах и графиках панели. Каждый метод возвращает JSON.
 */
import pool from '../db';
import { getRange } from '../utils/period';
import type { ErrorResponse } from '../types/models';
import { Request, Response } from "express";
import { getMostPopularDish, getOrdersByCategoryFromItems, getRepeatOrdersCount, getRepeatReservesCount } from "../services/stats.service";

const db = pool as unknown as Pool;

interface StatsCountResponse {
  count: number;
}

interface StatsSumResponse {
  sum: string;
}

interface StatsExtraResponse {
  avg: number;
  maxDay: string;
}

interface StatsOrdersByDayRow {
  day: string;
  count: number;
  sum: string;
}

interface StatsReservesByDayRow {
  day: string;
  count: number;
  sum: string;
}

interface CountRow {
  count: number;
}

interface SumRow {
  sum: string;
}

interface ExtraAvgRow {
  avg: number;
}

interface ExtraMaxDayRow {
  maxDay: string;
}

interface StatsHighlightsResponse {
  repeatOrders: number;
  repeatReserves: number;
  topDish: { name: string; count: number } | null;
}

/**
 * GET /stats/orders — считает количество записей в таблице orders (общий объём сделок).
 */
export const ordersTotal: RequestHandler<unknown, StatsCountResponse | ErrorResponse> = async (
  _req,
  res,
) => {
  try {
    const { rows } = await db.query<CountRow>(
      `
        SELECT COALESCE(COUNT(*), 0)::int AS count
        FROM orders
      `,
    );
    return res.json({ count: rows[0]?.count ?? 0 });
  } catch (error) {
    console.error('ordersTotal error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * GET /stats/reserves — возвращает количество записей в таблице reservations.
 */
export const reservesTotal: RequestHandler<unknown, StatsCountResponse | ErrorResponse> = async (
  _req,
  res,
) => {
  try {
    const { rows } = await db.query<CountRow>(
      `
        SELECT COALESCE(COUNT(*), 0)::int AS count
        FROM reservations
      `,
    );
    return res.json({ count: rows[0]?.count ?? 0 });
  } catch (error) {
    console.error('reservesTotal error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * GET /stats/orders-sum — суммирует колонку total (выручка) по всем заказам.
 */
export const ordersSum: RequestHandler<unknown, StatsSumResponse | ErrorResponse> = async (
  _req,
  res,
) => {
  try {
    const { rows } = await db.query<SumRow>(
      `
        SELECT COALESCE(SUM(total), 0)::bigint AS sum
        FROM orders
      `,
    );
    return res.json({ sum: rows[0]?.sum ?? '0' });
  } catch (error) {
    console.error('ordersSum error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * GET /stats/orders-extra — отдаёт дополнительные метрики: средний чек и максимальный дневной оборот.
 */
export const ordersExtra: RequestHandler<unknown, StatsExtraResponse | ErrorResponse> = async (
  _req,
  res,
) => {
  try {
    const avgQ = await db.query<ExtraAvgRow>(
      `
        SELECT COALESCE(AVG(total)::numeric, 0)::int AS avg
        FROM orders
      `,
    );

    const maxDayQ = await db.query<ExtraMaxDayRow>(
      `
        WITH per_day AS (
          SELECT COALESCE(date, created_at::date) AS d, SUM(total) AS day_sum
          FROM orders
          GROUP BY COALESCE(date, created_at::date)
        )
        SELECT COALESCE(MAX(day_sum), 0)::bigint AS "maxDay"
        FROM per_day
      `,
    );

    return res.json({
      avg: avgQ.rows[0]?.avg ?? 0,
      maxDay: maxDayQ.rows[0]?.maxDay ?? '0',
    });
  } catch (error) {
    console.error('ordersExtra error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * GET /stats/orders-by-day — возвращает массив точек временного ряда: количество и сумма заказов по дням.
 */
export const ordersByDay: RequestHandler<unknown, StatsOrdersByDayRow[] | ErrorResponse> = async (
  req,
  res,
) => {
  try {
    const { from, to } = getRange(req);

    const sql = `
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series($1::date, $2::date, interval '1 day') AS d
      )
      SELECT
        d.day::text AS day,
        COALESCE(COUNT(o.id), 0)::int AS count,
        COALESCE(SUM(o.total), 0)::bigint AS sum
      FROM days d
      LEFT JOIN orders o
        ON COALESCE(o.date, o.created_at::date) = d.day
      GROUP BY d.day
      ORDER BY d.day DESC
    `;

    const { rows } = await db.query<StatsOrdersByDayRow>(sql, [from, to]);
    return res.json(rows);
  } catch (error) {
    console.error('ordersByDay error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * GET /stats/reserves-by-day — аналогичный временной ряд, но для бронирований (сумма всегда 0 для совместимости).
 */
export const reservesByDay: RequestHandler<unknown, StatsReservesByDayRow[] | ErrorResponse> = async (
  req,
  res,
) => {
  try {
    const { from, to } = getRange(req);

    const sql = `
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series($1::date, $2::date, interval '1 day') AS d
      )
      SELECT
        d.day::text AS day,
        COALESCE(COUNT(r.id), 0)::int AS count,
        0::bigint AS sum
      FROM days d
      LEFT JOIN reservations r
        ON COALESCE(r.date, r.created_at::date) = d.day
      GROUP BY d.day
      ORDER BY d.day DESC
    `;

    const { rows } = await db.query<StatsReservesByDayRow>(sql, [from, to]);
    return res.json(rows);
  } catch (error) {
    console.error('reservesByDay error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};


export const highlights: RequestHandler<unknown, StatsHighlightsResponse | ErrorResponse> = async (_req, res) => {
  try {
    const [repeatOrders, repeatReserves, topDish] = await Promise.all([
      getRepeatOrdersCount(),
      getRepeatReservesCount(),
      getMostPopularDish(),
    ]);

    return res.json({
      repeatOrders,
      repeatReserves,
      topDish,
    });
  } catch (error) {
    console.error('highlights error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};


export async function itemsByCategory(req: Request, res: Response) {
  try {
    const rawDays = req.query.days;
    const parsedDays =
      rawDays === undefined || rawDays === null || String(rawDays).trim() === ''
        ? undefined
        : Number(rawDays);
    const days = Number.isFinite(parsedDays as number) ? (parsedDays as number) : undefined;

    const level = (req.query.level as "category" | "child_category") ?? "category";
    const metric = (req.query.metric as "count" | "revenue") ?? "count";

    const data = await getOrdersByCategoryFromItems({ level, metric, days });
    res.json(data); // [{ name, value, delta }]
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load stats" });
  }
}
