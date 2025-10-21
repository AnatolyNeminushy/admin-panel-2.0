
/**
 * JWT-хелперы: типизированная подпись и валидация токенов.
 */
import jwt from 'jsonwebtoken';

/**
 * Структура полезной нагрузки нашего токена (минимум id, опционально email/role).
 * Наследуемся от JwtPayload, чтобы совместить собственные поля и стандартные (exp, iat и т.д.).
 */
export interface AuthTokenPayload extends jwt.JwtPayload {
  id: string | number;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Секрет подписи: в разработке допускается дефолт, в проде — только через переменные окружения.
 */
const SECRET: jwt.Secret = process.env.JWT_SECRET ?? 'dev_secret';

/**
 * Время жизни токена: либо строковое обозначение ("7d"), либо число секунд.
 */
const EXPIRES_IN_RAW = process.env.JWT_EXPIRES;
const EXPIRES_IN_VALUE =
  EXPIRES_IN_RAW && EXPIRES_IN_RAW.trim().length > 0
    ? (Number.isNaN(Number(EXPIRES_IN_RAW)) ? EXPIRES_IN_RAW : Number(EXPIRES_IN_RAW))
    : undefined;

const SIGN_OPTIONS: jwt.SignOptions | undefined =
  typeof EXPIRES_IN_VALUE === 'number' || typeof EXPIRES_IN_VALUE === 'string'
    ? { expiresIn: EXPIRES_IN_VALUE as jwt.SignOptions['expiresIn'] }
    : undefined;

/**
 * Подписывает payload в JWT и возвращает строку-токен.
 */
export const sign = (payload: AuthTokenPayload): string => {
  return SIGN_OPTIONS ? jwt.sign(payload, SECRET, SIGN_OPTIONS) : jwt.sign(payload, SECRET);
};

/**
 * Проверяет и декодирует токен. В случае ошибки библиотека бросит исключение (например, TokenExpiredError).
 */
export const verify = (token: string): AuthTokenPayload => {
  return jwt.verify(token, SECRET) as AuthTokenPayload;
};
