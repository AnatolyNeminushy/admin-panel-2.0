/**
 * Контроллер авторизации: обработчики входа и получения текущего пользователя.
 */
import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import pool from '../db';
import { sign } from '../utils/jwt';
import type { AuthTokenPayload } from '../utils/jwt';

/**
 * Строковые поля, которые возвращает SELECT из таблицы accounts.
 */
interface AccountRow {
  id: number;
  email: string;
  full_name: string | null;
  role: string | null;
  password_hash: string | null;
  is_active: boolean | null;
  created_at: Date | string;
  last_login_at: Date | string | null;
}

interface PublicUser {
  id: number;
  email: string;
  fullName: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: Date | string;
  last_login_at: Date | string | null;
}

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
}

interface LoginSuccessResponse {
  token: string;
  user: PublicUser;
}

interface MeSuccessResponse {
  user: PublicUser | null;
}

interface ErrorResponse {
  error: string;
}

const db = pool as unknown as Pool;

const mapAccountToPublicUser = (acc: AccountRow): PublicUser => ({
  id: acc.id,
  email: acc.email,
  fullName: acc.full_name,
  role: acc.role,
  is_active: acc.is_active,
  created_at: acc.created_at,
  last_login_at: acc.last_login_at,
});

/**
 * POST /auth/login
 *  - 400, если не пришли email/password.
 *  - 401, если пара логин/пароль неверна.
 *  - 500, если JWT не настроен (нет секрета).
 *  - 200, если всё хорошо: { token, user }.
 */
export const login: RequestHandler<
  unknown,
  LoginSuccessResponse | ErrorResponse,
  LoginRequestBody
> = async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email & password required' });
    }

    const { rows } = await db.query<AccountRow>(
      `
      SELECT id, email, full_name, role, password_hash, is_active, created_at, last_login_at
      FROM accounts
      WHERE lower(email) = $1
        AND COALESCE(is_active, TRUE) = TRUE
      LIMIT 1
      `,
      [email],
    );
    const acc = rows[0];

    if (!acc?.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, acc.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.query('UPDATE accounts SET last_login_at = NOW() WHERE id = $1', [acc.id]).catch((rawError: unknown) => {
      const err = rawError as { code?: unknown; message?: unknown };
      const code = err?.code ? String(err.code) : undefined;
      const message = err?.message ? String(err.message) : 'unknown error';
      console.warn('skip last_login_at update:', code ?? message);
    });

    let token: string;
    try {
      token = sign({ id: acc.id, email: acc.email, role: acc.role ?? undefined });
    } catch (rawError) {
      console.error('JWT sign error:', rawError);
      return res.status(500).json({ error: 'JWT is not configured' });
    }

    return res.json({
      token,
      user: mapAccountToPublicUser(acc),
    });
  } catch (rawError: unknown) {
    console.error('LOGIN ERROR:', rawError);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/**
 * GET /auth/me
 *  - токен опционален. Если нет/невалиден — возвращаем { user: null } и 200.
 *  - если токен есть, подтягиваем свежие данные из БД.
 */
export const me: RequestHandler<unknown, MeSuccessResponse | ErrorResponse> = async (
  req,
  res,
) => {
    try {
      const userFromAuth = (req.user ?? null) as AuthTokenPayload | null;

      if (!userFromAuth) {
        return res.json({ user: null });
      }

      const { rows } = await db.query<AccountRow>(
        `
        SELECT id, email, full_name, role, is_active, created_at, last_login_at
        FROM accounts
        WHERE id = $1
        `,
        [userFromAuth.id],
      );
      const acc = rows[0];

      if (!acc) {
        return res.json({ user: null });
      }

      return res.json({
        user: mapAccountToPublicUser(acc),
      });
    } catch (rawError: unknown) {
      console.error('ME ERROR:', rawError);
      return res.status(500).json({ error: 'Internal error' });
    }
  };
