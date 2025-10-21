/**
 * Расширяем глобальные типы Express, добавляя поле user в Request.
 * Это поле заполняется JWT middleware и доступно во всём приложении.
 */
import type { AuthTokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload | null;
    }
  }
}

export {};
