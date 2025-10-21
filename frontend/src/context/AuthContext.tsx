/**
 * Провайдер аутентификации приложения.
 *
 * Зачем это нужно:
 * - Держим в одном месте: текущего пользователя (`user`), флаг готовности (`ready`)
 *   и методы для входа/выхода (`login`, `logout`).
 * - Любой экран может подписаться на контекст и синхронно понимать, готов ли UI.
 * - Перед тем как «разблокировать» основной интерфейс, провайдер **предзагружает критичные данные**
 *   (аналитические метрики), чтобы избежать "скачков" UI после авторизации.
 *
 * Современные практики:
 * - Возвращаемый тип компонента — `ReactElement` (без зависимости от глобального JSX-namespace).
 * - Отмена фоновых запросов через `AbortController`, а не флаг `let cancelled`.
 * - Стабильные колбэки через `useCallback` и мемоизация value через `useMemo`, чтобы не вызывать
 *   ненужные перерисовки подписчиков контекста.
 * - Аккуратная работа с ошибками `AxiosError` без «any» + дружелюбное сообщение пользователю.
 * - Дедупликация предзагрузки синглтоном-промисом (без гонок).
 */

import {
  useEffect,
  useMemo,
  useCallback,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import type { AxiosError } from "axios";

import api from "../services/api";
import { AuthContext, type AuthUser, type AuthStatus } from "./AuthContext.shared";
export type { AuthUser, AuthContextValue, AuthStatus } from "./AuthContext.shared";

// --- Предзагрузка критичных данных (дешёвая и безопасная) --------------------

/**
 * Дедуплицируем предзагрузку аналитики: если несколько частей UI
 * почти одновременно инициируют `preloadCriticalData()`, выполнится ровно один запрос.
 */
let bootstrapPromise: Promise<void> | null = null;
let bootstrapCompleted = false;
let logoutTimer: ReturnType<typeof setTimeout> | null = null;

async function preloadCriticalData(): Promise<void> {
  if (bootstrapCompleted) return;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        // Ленивая подгрузка кода страницы аналитики — быстрее первый рендер.
        const { fetchGlobalStats } = await import("../pages/analytics/api");
        await fetchGlobalStats();
        bootstrapCompleted = true;
      } catch (error) {
        // Метрики не критичны: UI продолжит загрузку без них.
        if (import.meta.env.DEV) {
          // В dev-режиме подскажем в консоль, где искать первопричину.
          // eslint-disable-next-line no-console
          console.warn("[AuthProvider] Failed to preload analytics stats", error);
        }
      } finally {
        bootstrapPromise = null;
      }
    })();
  }

  // Если промис уже кем-то создан — просто дожидаемся его завершения.
  try {
    await bootstrapPromise;
  } catch {
    // Ошибка не критична — продолжаем без аналитики
  }
}

// --- Типы ответов API ---------------------------------------------------------

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthMeResponse {
  user: AuthUser | null;
}

interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}

// --- Провайдер контекста аутентификации --------------------------------------

export default function AuthProvider({ children }: AuthProviderProps): ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("initializing");

  /**
   * Первичная инициализация:
   * 1) пробуем получить текущую сессию (`/auth/me`);
   * 2) если пользователь есть — подгружаем критичные данные до `ready=true`;
   * 3) в любом случае выставляем `ready=true`, чтобы UI мог отобразить состояние.
   *
   * Современный момент: используем AbortController, чтобы избежать setState
   * после размонтирования компонента (устраняем гонки и утечки).
   */
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      setStatus("initializing");
      try {
        const { data } = await api.get<AuthMeResponse>("/auth/me", {
          signal: controller.signal,
        });

        const nextUser = data.user ?? null;
        setUser(nextUser);

        if (nextUser) {
          await preloadCriticalData();
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      } catch (e) {
        // Прерывание запроса — штатный сценарий при размонтировании
        const err = e as AxiosError<{ error?: string }>;
        if ((err as any)?.code === "ERR_CANCELED" || err.name === "CanceledError") {
          return;
        }
        // Любая иная ошибка — считаем, что пользователь не залогинен.
        setUser(null);
        setStatus("unauthenticated");
      } finally {
        setReady(true);
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  /**
   * Вход: сохраняем токен, актуализируем пользователя, ждем критичные данные.
   * Ошибка — бросаем человеко-понятное сообщение (без деталей бэкенда).
  */
  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    setReady(false);
    setStatus("logging-in");
    let succeeded = false;
    try {
      const { data } = await api.post<AuthLoginResponse>("/auth/login", { email, password });

      // Если выполняется в браузере — сохраняем токен.
      if (typeof window !== "undefined") {
        localStorage.setItem("auth_token", data.token);
      }

      setUser(data.user);
      await preloadCriticalData();
      succeeded = true;
      return data.user;
    } catch (e) {
      setStatus("unauthenticated");
      const err = e as AxiosError<{ error?: string }>;
      const message =
        err.response?.data?.error ?? "Не удалось авторизоваться, попробуйте ещё раз.";
      throw new Error(message);
    } finally {
      setReady(true);
      if (succeeded) {
        setStatus("authenticated");
      }
    }
  }, []);

  /**
   * Выход: чистим токен и локальное состояние пользователя.
   * Подсказка: если у API есть endpoint `/auth/logout`, можно вызвать его здесь.
   */
  const logout = useCallback((): void => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }

    if (logoutTimer) {
      clearTimeout(logoutTimer);
      logoutTimer = null;
    }

    setStatus("logging-out");
    setReady(false);
    setUser(null);

    logoutTimer = setTimeout(() => {
      setStatus("unauthenticated");
      setReady(true);
      logoutTimer = null;
    }, 220);
  }, []);

  // Мемоизируем значение контекста, чтобы подписчики не ререндерились без причины.
  const value = useMemo(
    () => ({ user, ready, status, login, logout }),
    [user, ready, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
