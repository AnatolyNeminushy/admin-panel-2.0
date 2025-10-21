/**
 * Маршруты для заказов: список, создание, обновление и удаление.
 */
import { Router } from 'express';

import asyncH from '../utils/asyncH';
import * as orders from '../controllers/orders.controller';

const router = Router();

/**
 * GET /orders — выдаёт список заказов, поддерживает режим таблицы/фильтров на стороне контроллера.
 */
router.get('/', asyncH(orders.list));

/**
 * POST /orders — создаёт новый заказ.
 */
router.post('/', asyncH(orders.create));

/**
 * PUT /orders/:id — обновляет существующий заказ.
 */
router.put('/:id', asyncH(orders.update));

/**
 * DELETE /orders/:id — удаляет заказ.
 */
router.delete('/:id', asyncH(orders.remove));

export default router;
