/**
 * SSE-эндпоинт: на /events отдаём поток обновлений для админ-панели.
 */
import { Router } from 'express';

import { sseHandler } from '../utils/events';

const router = Router();

/**
 * GET /events — держит соединение открытым и транслирует события выбранных топиков.
 */
router.get('/', sseHandler);

export default router;
