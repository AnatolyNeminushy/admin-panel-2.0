/**
 * Контекст аутентификации (типизация и безопасный доступ).
 *
 * Зачем это нужно:
 * - Централизуем данные о текущем пользователе и методах входа/выхода,
 *   чтобы любые компоненты могли читать их через контекст.
 * - Типы описывают контракт: что именно вернёт провайдер (user, ready, login, logout).
 * - Защитимся от "тихих" ошибок: кастомный хук `useAuth()` бросит исключение,
 *   если контекст не обёрнут провайдером.
 *
 * Детали реализации:
 * - Используем современный паттерн: `createContext<T | undefined>(undefined)` +
 *   хук-обёртка. Это лучше, чем `null`, потому что заставляет явно обрабатывать
 *   отсутствие провайдера и не размазывать в коде проверки на null.
 * - Поля имени у некоторых бэкендов приходят в разном формате (`fullName`, `full_name`, `name`).
 *   Мы оставляем их в интерфейсе для совместимости, но рекомендуем внутри приложения
 *   нормализовывать отображаемое имя (см. подсказку в комментарии ниже).
 * - Индексная сигнатура `[key: string]: unknown` позволяет безопасно тащить
 *   дополнительные поля профиля без потери типизации базовых свойств.
 */

import { createContext } from "react";

/**
 * Базовая форма пользователя.
 * Подсказка: для UI стоит завести утилиту, которая вернёт "отображаемое имя"
 * в порядке приоритета, например:
 * `displayName = fullName ?? full_name ?? username ?? name ?? email ?? "Гость"`.
 */
export interface AuthUser {
  id?: string | number;
  email?: string;
  username?: string;
  fullName?: string;
  full_name?: string;
  name?: string;
  role?: string;
  is_active?: boolean | null;
  created_at?: string | number | Date | null;
  last_login_at?: string | number | Date | null;
  [key: string]: unknown;
}

/**
 * Значение контекста аутентификации.
 * - `ready` — флаг, что инициализация (проверка сессии/токена) завершена.
 * - `login` — асинхронный вход; возвращает актуальные данные пользователя.
 * - `logout` — выход и очистка сессии.
 */
export type AuthStatus = "initializing" | "logging-in" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

/**
 * Сам контекст. По умолчанию `undefined`, чтобы хук `useAuth()` мог
 * отловить использование вне провайдера (современная безопасная практика).
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
