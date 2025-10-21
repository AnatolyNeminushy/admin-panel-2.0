/**
 * Хук управления массовой рассылкой (broadcast).
 *
 * Зачем нужен:
 * - Инкапсулирует запуск рассылки и хранение прогресса отправок, чтобы UI оставался «тонким».
 * - Выдаёт флаги состояния (isSending) и прогресс по каждому получателю в едином, предсказуемом формате.
 *
 * Как устроен:
 * - `handleSend(payload)` инициирует запрос к API и обновляет прогресс атомарно.
 * - Ошибки складываем в поле `error` рядом с численным прогрессом — так компоненту проще показывать состояние без
 *   раздувания количества отдельных стейтов.
 * - Начальное значение прогресса задаём явно (total/sent/failed/items), чтобы потребители могли сразу рисовать
 *   «скелетон» и проценты даже до ответа сервера.
*/

import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { apiStartBroadcast, type StartBroadcastPayload } from "../api";
import type { BroadcastProgress } from "../types";

/** Расширяем доменную модель прогресса техническим полем ошибки для UI. */
type BroadcastState = BroadcastProgress & { error?: string };

interface UseBroadcastResult {
  /** Флаг активной отправки: удобно блокировать кнопки и показывать спиннер. */
  isSending: boolean;
  /** Текущее состояние прогресса; `null` — когда рассылка ещё не запускалась. */
  progress: BroadcastState | null;
  /** Позволяет родителю при необходимости вручную скорректировать прогресс (например, для optimistic-UI). */
  setProgress: Dispatch<SetStateAction<BroadcastState | null>>;
  /** Запуск рассылки. Возвращает Promise для удобного `await` в компонентах. */
  handleSend: (payload: StartBroadcastPayload) => Promise<void>;
}

export function useBroadcast(): UseBroadcastResult {
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<BroadcastState | null>(null);

  const handleSend = useCallback(async (payload: StartBroadcastPayload) => {
    setIsSending(true);

    // Минимально полезное начальное состояние: позволяет сразу показать прогресс-бар/счётчики.
    setProgress({
      total: 0,
      sent: 0,
      failed: 0,
      items: [],
    });

    try {
      // Сервер возвращает актуальный прогресс. Дженерик фиксирует ожидаемую форму ответа.
      const data = await apiStartBroadcast<BroadcastProgress>(payload);

      // Совмещаем доменную модель с нашим UI-полем ошибки (оно сбрасывается).
      const next: BroadcastState = { ...data, error: undefined };
      setProgress(next);
    } catch (err: unknown) {
      // Аккуратно извлекаем сообщение из разных вариантов ошибки.
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (String((err as any).message) || undefined)
          : undefined;

      // Держим текст ошибки рядом с прогрессом — UI проще.
      setProgress((prev) => ({
        ...(prev ?? { total: 0, sent: 0, failed: 0, items: [] }),
        error: message || "Не удалось выполнить отправку. Проверьте подключение и попробуйте снова.",
      }));
    } finally {
      setIsSending(false);
    }
  }, []);

  return { isSending, progress, setProgress, handleSend };
}
