/**
 * Маршруты статистики: агрегаты по заказам/броням и временные ряды.
 */
import { Router } from "express";

import asyncH from "../utils/asyncH";
import * as stats from "../controllers/stats.controller";
import { itemsByCategory } from "../controllers/stats.controller";

const router = Router();

/**
 * GET /stats/orders — общая статистика по заказам (количество, суммы и т.п.).
 */
router.get("/orders", asyncH(stats.ordersTotal));

/**
 * GET /stats/reserves — общая статистика по броням.
 */
router.get("/reserves", asyncH(stats.reservesTotal));

/**
 * GET /stats/orders-sum — суммарные показатели по заказам за выбранный период.
 */
router.get("/orders-sum", asyncH(stats.ordersSum));

/**
 * GET /stats/orders-extra — дополнительные метрики по заказам (см. контроллер).
 */
router.get("/orders-extra", asyncH(stats.ordersExtra));

/**
 * GET /stats/orders-by-day — агрегированные значения по заказам в разрезе дней.
 */
router.get("/orders-by-day", asyncH(stats.ordersByDay));

/**
 * GET /stats/reserves-by-day — агрегированные значения по броням в разрезе дней.
 */
router.get("/reserves-by-day", asyncH(stats.reservesByDay));

/**
 * GET /stats/highlights — повторные заказы/брони и самое популярное блюдо.
 */
router.get("/highlights", asyncH(stats.highlights));

/** 
 * GET /stats/items-by-category — распределение заказов/выручки по категориям товаров. 
 */ 
router.get("/items-by-category", itemsByCategory);

export default router;


