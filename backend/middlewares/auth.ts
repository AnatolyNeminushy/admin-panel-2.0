/**
 * Middleware аутентификации по JWT в заголовке Authorization: Bearer <token>.
 */
import { RequestHandler } from 'express';

import { AuthTokenPayload, verify } from '../utils/jwt';

const BEARER_PREFIX = 'Bearer ';

export type AuthMiddleware = RequestHandler;

/**
 * Возвращает middleware, который проверяет токен и кладёт payload в req.user.
 * @param required Если true — отклоняет запрос без токена / с неверным токеном (401).
 *                 Если false — пропускает дальше с req.user = null.
 */
export default function auth(required = true): AuthMiddleware {
  return (req, res, next) => {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith(BEARER_PREFIX)
      ? authHeader.slice(BEARER_PREFIX.length)
      : null;

    if (!token) {
      if (required) {
        return res.status(401).json({ error: 'No token' });
      }
      req.user = null;
      return next();
    }

    try {
      const payload = verify(token);
      req.user = payload;
      return next();
    } catch (error) {
      console.warn('[auth] verify failed:', (error as Error).name, (error as Error).message);

      if (required) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = null;
      return next();
    }
  };
}
