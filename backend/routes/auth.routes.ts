/**
 * Маршруты авторизации: вход по email/password и получение текущего пользователя.
 */
import { Router } from 'express';
import type { RequestHandler } from 'express';

import { login, me } from '../controllers/auth.controller';
import auth from '../middlewares/auth';

const router = Router();

/**
 * Заглушка на случай, если авторизационный middleware недоступен (например, при тестах).
 */
const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * auth(false) делает токен необязательным — в optional-режиме возвращаем { user: null }.
 */
const optionalAuth = typeof auth === 'function' ? auth(false) : passThrough;

/**
 * POST /auth/login — проверка пары email/пароль, выдача JWT и публичного профиля.
 */
router.post('/login', login);

/**
 * GET /auth/me — возвращает актуальные данные пользователя или null, если токена нет.
 */
router.get('/me', optionalAuth, me);

export default router;
