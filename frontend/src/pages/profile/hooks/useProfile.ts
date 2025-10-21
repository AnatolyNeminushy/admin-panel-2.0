/**
 * Хук useProfile — единая точка правды про текущего пользователя.
 *
 * Что делает:
 * - Инициирует загрузку профиля (getMe) при маунте, держит флаги `loading`/`err`.
 * - Возвращает `onLogout`, «жёсткий» `clearLocal` (с чисткой cookie/localStorage) и `refresh`.
 * - Отдаёт «инициал» пользователя для аватарки/заглушки.
 *
 * Почему так:
 * - Навигацию после разлогина инкапсулируем в хук (не размазываем логику по страницам).
 * - Сторонние эффекты (чистка storage/cookie, сброс заголовка Authorization) — отдельной утилитой `clearTokens`,
 *   чтобы их можно было переиспользовать и тестировать изолированно.
 * - Гард на размонтирование через `useRef(isUnmounted)` вместо переменной `let mounted` —
 *   это современный безопасный паттерн (устойчив к повторным рендерам и замыканиям React 18+).
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import type { NavigateFunction } from 'react-router-dom'

import api from '@/services/api'
import type { AuthUser } from '@/context/AuthContext'
import { getMe } from '../api'

interface UseProfileParams {
  navigate: NavigateFunction
  logout?: () => void
}

interface UseProfileReturn {
  user: AuthUser | null
  loading: boolean
  err: string
  onLogout: () => void
  refresh: () => Promise<void>
  clearLocal: () => void
  initial: string
}

/**
 * Удаляем клиентские маркеры авторизации и сбрасываем заголовок.
 * Почему cookie тоже: сторонние интеграции/SSR могут читать cookie — полезно уметь «выметать» всё.
 */
function clearTokens(alsoCookie = false): void {
  if (typeof window === 'undefined') return

  try {
    // local/session storage — на случай, если токен был положен в любую из областей
    window.localStorage.removeItem('auth_token')
    window.sessionStorage.removeItem('auth_token')

    // axios: убираем Authorization, чтобы не «засвечивать» протухший токен при следующих вызовах
    if (api?.defaults?.headers?.common?.Authorization) {
      delete api.defaults.headers.common.Authorization
    }

    // cookie: ставим истёкший срок жизни (универсальный способ удаления)
    if (alsoCookie && typeof document !== 'undefined') {
      document.cookie =
        'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax'
    }
  } catch (error) {
    // Логируем, но не бросаем — чистка не должна ронять потребителя
    // (например, в приватном режиме storage может быть недоступен).
    console.error('clearTokens error', error)
  }
}

/**
 * Достаём первую букву для аватарки из fullName/full_name/email.
 * Зачем: недорогая визуальная подсказка идентичности пользователя.
 */
function getInitialLetter(user: AuthUser | null): string {
  const char =
    user?.fullName?.[0] ??
    user?.full_name?.[0] ??
    user?.email?.[0] ??
    '?'

  return (char || '?').toUpperCase()
}

export function useProfile({ navigate, logout }: UseProfileParams): UseProfileReturn {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Флаг размонтирования: защищаем setState после unmount (React Strict/Concurrent режимы)
  const isUnmountedRef = useRef(false)

  /**
   * Централизованный редирект в /login с предварительной чисткой токенов.
   * Важно: мемоизируем по navigate, чтобы не ломать зависимости эффектов.
   */
  const redirectToLogin = useCallback(
    (alsoCookie = false): void => {
      clearTokens(alsoCookie)
      // replace: не даём «Назад» вернуться на закрытую страницу
      navigate('/login', { replace: true })
    },
    [navigate],
  )

  useEffect(() => {
    // Опционально (когда появится поддержка): const ac = new AbortController()
    // и передавать ac.signal в getMe, а в cleanup — ac.abort()
    ;(async () => {
      try {
        const me = await getMe(/* { signal: ac.signal } */)
        if (!isUnmountedRef.current) {
          setUser(me ?? null)
        }
      } catch (error) {
        // Специальный кейс: 401 = протухшая сессия → выходим и ведём на /login
        if (isAxiosError(error) && error.response?.status === 401) {
          if (!isUnmountedRef.current) {
            setUser(null)
          }
          redirectToLogin()
          return
        }

        if (!isUnmountedRef.current) {
          setUser(null)
          setErr('Не удалось загрузить профиль')
        }
        console.error('useProfile:getMe error', error)
      } finally {
        if (!isUnmountedRef.current) {
          setLoading(false)
        }
      }
    })()

    return () => {
      isUnmountedRef.current = true
      // ac.abort() — если добавите AbortController
    }
  }, [redirectToLogin])

  /**
   * Мягкий выход: пытаемся вызвать переданный logout (например, очистка стора/кэшей),
   * затем гарантированно переводим пользователя на /login.
   * try/finally — чтобы редирект сработал даже при ошибках в logout().
   */
  const onLogout = useCallback((): void => {
    try {
      logout?.()
    } finally {
      redirectToLogin()
    }
  }, [logout, redirectToLogin])

  /**
   * Ручное обновление профиля (например, после редактирования настроек).
   * Держим единый UX: сбрасываем ошибку, показываем лоадер.
   */
  const refresh = useCallback(async (): Promise<void> => {
    setErr('')
    setLoading(true)

    try {
      const me = await getMe()
      setUser(me ?? null)
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setUser(null)
        redirectToLogin()
        return
      }

      setUser(null)
      setErr('Ошибка обновления данных')
      console.error('useProfile:refresh error', error)
    } finally {
      setLoading(false)
    }
  }, [redirectToLogin])

  /**
   * Жёсткая очистка локального состояния авторизации (включая cookie).
   * Полезно для сценариев «Сменить пользователя на этом устройстве» или «Забыть меня».
   */
  const clearLocal = useCallback((): void => {
    try {
      logout?.()
    } finally {
      redirectToLogin(true)
    }
  }, [logout, redirectToLogin])

  // Мемоизация инициала — не пересчитываем на каждый рендер
  const initial = useMemo(() => getInitialLetter(user), [user])

  return {
    user,
    loading,
    err,
    onLogout,
    refresh,
    clearLocal,
    initial,
  }
}
