/**
 * API-утилиты для рассылок.
 *
 * Коротко: типобезопасные обёртки вокруг fetch для загрузки списка получателей и запуска рассылки.
 *
 * Зачем отдельный модуль:
 * - Единые правила сериализации query/body (без "магии" по всему коду).
 * - Централизованная обработка ошибок и абортов (AbortSignal), чтобы UI не подвисал.
 * - Чёткие контракты типов на вход/выход — проще сопровождать и тестировать.
 */

import type { MailingFilters, PlatformKey } from "../types";

/** Базовый URL бэкенда. Ожидается полный адрес (например, https://api.example.com). */
const API_BASE = (import.meta as any)?.env?.VITE_API_URL as string;

/** Опции запроса. signal нужен, чтобы можно было отменять «длинные» запросы из UI. */
interface FetchOptions extends RequestInit {
  signal?: AbortSignal;
}

/**
 * Универсальный помощник для HTTP-запросов, который:
 * 1) корректно читает пустые ответы/204 No Content,
 * 2) аккуратно парсит JSON только когда это действительно JSON,
 * 3) выбрасывает осмысленные ошибки с текстом от сервера (если доступен).
 */
async function fetchJSON<T>(url: string | URL, options: FetchOptions = {}): Promise<T> {
  // Неочевидный момент: не навешиваем автоматически заголовок Content-Type,
  // потому что для GET/HEAD он не нужен, а для POST мы выставим его точечно.
  const response = await fetch(url, options);

  // Быстрый выход для 204/пустого тела
  const contentType = response.headers.get("content-type") ?? "";
  const hasBody =
    response.status !== 204 &&
    // у некоторых серверов пустое тело приходит с content-length: "0"
    (response.headers.get("content-length") === null ||
      response.headers.get("content-length") === undefined ||
      response.headers.get("content-length") === "0" ? false : true);

  let parsed: unknown = undefined;

  if (hasBody && contentType.includes("application/json")) {
    // Безопасный parse: любые ошибки парсинга — это проблема ответа сервера
    try {
      parsed = await response.json();
    } catch {
      // fallback: пробуем прочитать как текст, чтобы показать первые ~200 символов
      const raw = await response.text().catch(() => "");
      throw new Error(raw?.slice(0, 200) || "Некорректный JSON-ответ сервера");
    }
  } else if (hasBody) {
    // Если тело есть, но это не JSON — прочитаем текст, чтобы явно показать проблему
    const rawText = await response.text().catch(() => "");
    parsed = rawText;
  }

  if (!response.ok) {
    // В приоритете structured error из JSON: { error: string }
    const message =
      (parsed as { error?: string } | null)?.error ||
      (typeof parsed === "string" && parsed) ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  // Если сервер вернул пустое тело — возвращаем пустой объект того же типа (для удобства вызова)
  return (parsed as T) ?? ({} as T);
}

/** Параметры загрузки получателей рассылки. */
export interface LoadRecipientsParams {
  /** Список платформ, по которым следует отфильтровать аудиторию. */
  platforms?: ReadonlyArray<PlatformKey>;
  /** Дополнительные бизнес-фильтры: передаём только то, что реально поддерживается бэком. */
  filters?: Partial<MailingFilters> | Record<string, unknown>;
  /** Желаемый лимит получателей для превью. */
  limit?: number;
  /** Сигнал для отмены запроса (например, при быстрой смене фильтров). */
  signal?: AbortSignal;
}

/**
 * Загрузить превью получателей для рассылки.
 *
 * Подсказка: безопасно вызывать при каждом изменении фильтров — запрос можно отменять через AbortController,
 * чтобы не перегружать UI и не показывать устаревшие результаты.
 */
export async function apiLoadRecipients<TResponse = unknown>({
  platforms = [],
  filters = {},
  limit = 500,
  signal,
}: LoadRecipientsParams): Promise<TResponse> {
  // Неочевидный момент: сериализация массивов и объектов в query.
  // Используем URL + URLSearchParams, чтобы корректно экранировать значения.
  const url = new URL("/broadcasts/recipients", API_BASE);
  const params = new URLSearchParams({
    platforms: platforms.join(","), // на бэке ожидается CSV — это быстрее и компактнее, чем JSON
    filters: JSON.stringify(filters ?? {}),
    limit: String(limit),
  });
  url.search = params.toString();

  return fetchJSON<TResponse>(url, { signal });
}

/** Полезная нагрузка для старта рассылки. Типы оставлены расширяемыми — требования зависят от бэкенда. */
export interface StartBroadcastPayload {
  title?: string;
  text?: string;
  media?: unknown;
  mode?: string;
  recipients?: unknown;
  /** Допускаем расширение контракта без ломки типов. */
  [key: string]: unknown;
}

/**
 * Запустить рассылку.
 *
 * Заметка: заголовок Content-Type выставляем только здесь (POST + JSON).
 * Это избавляет от неожиданных побочных эффектов у GET-запросов.
 */
export async function apiStartBroadcast<TResponse = unknown>(
  payload: StartBroadcastPayload,
  options: { signal?: AbortSignal } = {},
): Promise<TResponse> {
  const url = new URL("/broadcasts", API_BASE);

  return fetchJSON<TResponse>(url, {
    method: "POST",
    headers: {
      // Если потребуется передавать токен — добавляйте Authorization здесь же.
      "Content-Type": "application/json",
    } as HeadersInit,
    body: JSON.stringify(payload ?? {}),
    signal: options.signal,
  });
}
