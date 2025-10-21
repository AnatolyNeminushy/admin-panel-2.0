/**
 * Простейший проверочный эндпоинт: отвечает ok=true, если приложение живо.
 */
import { Router } from 'express';

const router = Router();

/**
 * GET /health — используется мониторингом/оркестратором для проверки состояния.
 */
router.get('/', (_req, res) => res.json({ ok: true }));

export default router;
