/**
 * Хук useRecipients
 *
 * Коротко: инкапсулирует запрос получателей рассылки к API и хранит три ключевых состояния UI:
 * список, индикатор загрузки и (читаемую) ошибку.
 *
 * Зачем так:
 * - В одном месте нормализуем входные данные (map чекбоксов платформ → массив ключей платформ).
 * - Возвращаем минимально достаточное API для компонентов: `recipients`, `loadingRecipients`,
 *   `loadError`, `loadRecipients`, а также `setRecipients` для локальных правок списка (оптимистические апдейты).
 * - Ошибки приводим к человеко-читаемой строке и заранее очищаем перед новым запросом,
 *   чтобы не «липли» старые сообщения.
*/

import { useState, useCallback } from "react";
import { apiLoadRecipients } from "../api";
import type { MailingFilters, PlatformKey, RecipientSummary } from "../types";

interface LoadRecipientsArgs {
  /** Карта чекбоксов платформ, например: { tg: true, vk: false } */
  platformsObj?: Partial<Record<PlatformKey, boolean>>;
  /** Фильтры запроса — можно передавать только изменившиеся поля */
  filters?: Partial<MailingFilters>;
  /** Ограничение на кол-во элементов (для пагинации/предпросмотра) */
  limit?: number;
}

interface UseRecipientsResult {
  /** Текущий список получателей (нормализованный массив) */
  recipients: RecipientSummary[];
  /** Сеттер для локных оптимистических апдейтов (удаление/добавление) */
  setRecipients: React.Dispatch<React.SetStateAction<RecipientSummary[]>>;
  /** Индикатор активного запроса: true — идёт загрузка */
  loadingRecipients: boolean;
  /** Читаемая ошибка последней загрузки (пустая строка, если всё ок) */
  loadError: string;
  /** Функция загрузки: нормализует вход, валидирует и тянет данные из API */
  loadRecipients: (args?: LoadRecipientsArgs) => Promise<void>;
}

interface LoadRecipientsResponse {
  items?: RecipientSummary[];
}

/** Приводим `unknown` ошибку к безопасной строке */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  // Популярный кейс с axios/fetch, когда ошибка «распухшая»
  // @ts-expect-error — мягкая попытка вытащить поле message без жёсткой схемы
  const candidate = err?.response?.data?.error ?? err?.message;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  return "Ошибка загрузки списка";
}

export function useRecipients(): UseRecipientsResult {
  const [recipients, setRecipients] = useState<RecipientSummary[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadRecipients = useCallback(
    async (args?: LoadRecipientsArgs) => {
      const { platformsObj = {}, filters = {}, limit } = args ?? {};

      setLoadingRecipients(true);
      setLoadError("");

      try {
        // Превращаем карту чекбоксов в список ключей платформ (только включённые).
        // Важно: явно приводим ключ к PlatformKey, чтобы не пропустить опечатки.
        const platforms = Object.entries(platformsObj)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key as PlatformKey);

        // Неочевидный UX-ранний выход: без платформ смысла дергать бэкенд нет.
        if (platforms.length === 0) {
          setRecipients([]);
          setLoadError("Выберите хотя бы одну платформу (Telegram/VK).");
          return;
        }

        const data = await apiLoadRecipients<LoadRecipientsResponse>({
          platforms,
          filters,
          limit,
        });

        // Нормализуем ответ: если сервер вернул не-массив — подстраховываемся пустым массивом.
        setRecipients(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        setRecipients([]);
        setLoadError(extractErrorMessage(err));
      } finally {
        setLoadingRecipients(false);
      }
    },
    [] // Зависим только от стабильных React-сеттеров и импортов; колбэк остаётся стабильным.
  );

  return {
    recipients,
    setRecipients,
    loadingRecipients,
    loadError,
    loadRecipients,
  };
}
