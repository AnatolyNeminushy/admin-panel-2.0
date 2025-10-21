import api from '@/services/api'
import type { AuthUser } from '@/context/AuthContext'

/**
 * Получение текущего пользователя ("/auth/me").
 *
 * Что делает:
 * - Делает безопасный запрос к бекенду за профилем текущего пользователя.
 * - Возвращает `AuthUser | null` (никогда не кидает наружу сетевые/парсинг-ошибки),
 *   чтобы вызовы в UI были простыми и предсказуемыми.
*/

type MePayload = Readonly<{ user: AuthUser | null }>

/** Узкоутилитарная проверка "это объект?" — нужна перед доступом к полям. */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** Проверяем, что ответ действительно содержит поле `user`. */
const hasUserField = (v: unknown): v is MePayload =>
  isRecord(v) && Object.hasOwn(v, 'user')

/**
 * Возвращает текущего пользователя или `null`, если не авторизован/ошибка сети/неожиданный формат.
 * @param signal AbortSignal для отмены запроса (современно и дружелюбно к React/Router).
 */
export async function getMe(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<unknown>('/auth/me', { signal })
    return hasUserField(data) ? data.user ?? null : null
  } catch {
    // Не пробрасываем ошибку — UI сможет показать гостевой режим без падения.
    return null
  }
}
