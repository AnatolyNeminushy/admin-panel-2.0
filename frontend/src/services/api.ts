/**
 * Клиент HTTP для общения с backend через Axios.
 *
 * Зачем это нужно:
 * - Централизуем базовый URL, куки/заголовки и таймауты → единое поведение по всему приложению.
 * - Автоматически подставляем Bearer-токен в запросы (если пользователь уже авторизован).
 * - Делаем код SSR/Edge-safe: не обращаемся к window там, где его может не быть.
 *
 * Как использовать:
 *   import api from './api'
 *   const { data } = await api.get('/users/me')
 *
 * Пояснения и мини-подсказки:
 * - baseURL выбирается от окружения Vite: в dev идём на прокси `/api`, в prod — на `VITE_API_URL`.
 *   Если переменная не задана, Axios обратится к текущему домену (что ок для simple-deploy).
 * - Токен читаем из localStorage при каждом запросе — это простая и наглядная стратегия.
 *   Для высоких требований к безопасности подумайте о httpOnly-cookie + CSRF защите на бэке.
 * - Работа с заголовками сделана через AxiosHeaders (идеоматика Axios v1, актуально на 2025 год).
 */

import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_URL,
  withCredentials: true,
  // Дефолтный сетевой таймаут: чтобы "висящие" запросы не блокировали UX.
  timeout: 15_000,
})

// Небольшое рантайм-предупреждение для prod-сборки, если забыли выставить VITE_API_URL.
// Логика не критична и не ломает приложение.
if (!import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  console.warn('[api] VITE_API_URL не задан — запросы пойдут на текущий домен.')
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // SSR/Edge-safe доступ к window: в средах без DOM (SSR, workers) просто пропускаем токен.
  const w = typeof globalThis !== 'undefined' && (globalThis as any).window
  if (!w) return config

  const token = w.localStorage?.getItem('auth_token')
  if (!token) return config

  // Нормализуем заголовки через AxiosHeaders (современный способ для Axios v1).
  const headers =
    config.headers instanceof AxiosHeaders
      ? config.headers
      : new AxiosHeaders(config.headers)

  headers.set('Authorization', `Bearer ${token}`)
  config.headers = headers

  return config
})

// Опциональный перехватчик ответов: помогает ловить 401 и централизованно реагировать.
// Подсказка: здесь можно инициировать logout/refresh, показывать тосты и т.д.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      // Например, можно диспатчить событие, логировать метрику или чистить токен.
      // window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    return Promise.reject(error)
  }
)

export default api
