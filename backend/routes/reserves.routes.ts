/**
 * Маршруты для броней: стандартный CRUD-набор.
 */
import { Router } from 'express';

import asyncH from '../utils/asyncH';
import * as reserves from '../controllers/reserves.controller';

const router = Router();

/**
 * GET /reserves — список броней (контроллер может отдавать таблицу или карточки).
 */
router.get('/', asyncH(reserves.list));

/**
 * POST /reserves — создаёт новую бронь.
 */
router.post('/', asyncH(reserves.create));

/**
 * PUT /reserves/:id — обновляет бронь с указанным идентификатором.
 */
router.put('/:id', asyncH(reserves.update));

/**
 * DELETE /reserves/:id — удаляет бронь.
 */
router.delete('/:id', asyncH(reserves.remove));

export default router;
