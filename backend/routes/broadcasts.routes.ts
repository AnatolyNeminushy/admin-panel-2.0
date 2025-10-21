/**
 * Маршруты рассылок: предпросмотр получателей и запуск отправки.
 */
import { Router } from 'express';

import asyncH from '../utils/asyncH';
import { preview, sendBroadcast } from '../controllers/broadcasts.controller';

const router = Router();

/**
 * GET /broadcasts/recipients — считает получателей по заданным фильтрам без фактической отправки.
 */
router.get('/recipients', asyncH(preview));

/**
 * POST /broadcasts — стартует рассылку (или тестовую отправку) и возвращает сводку по задаче.
 */
router.post('/', asyncH(sendBroadcast));

export default router;
