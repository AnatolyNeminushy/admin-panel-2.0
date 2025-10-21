/**
 * Компонент "MessagePane" — окно чата.
 *
 * Что делает:
 * - Рендерит ленту сообщений со «склейкой» по времени (группировка в цепочки, как в мессенджерах).
 * - Умеет подгружать историю при прокрутке вверх (infinite scroll, prefetch на малой высоте).
 * - Держит «липкое дно» (sticky bottom): если пользователь у нижнего края — авто-скроллит новые сообщения вниз.
 * - Корректно восстанавливает позицию после дозагрузки (без «скачка» контента).
 * - Предоставляет поле ввода с отправкой по Enter (Shift+Enter — перенос строки).
 *
 * Почему так:
 * - Скролл и вычисления привязаны к requestAnimationFrame, чтобы синхронизироваться с кадром браузера и избежать рывков.
 * - Ключевые обработчики обёрнуты в useCallback — это стабилизирует ссылки и уменьшает лишние перерисовки.
 * - Парсер даты «терпимый»: принимает Date/number/строку формата `YYYY-MM-DD HH:mm:ss(.SSS)` и аккуратно падает в -Infinity.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";

import MessageBubble, {
  type ChatMessage,
  type MessageBubblePosition,
} from "./MessageBubble";
import sendIcon from "@/assets/icons/general/send.svg";
import backIcon from "@/assets/icons/general/back.svg";
import type { ChatDialog } from "./ChatListItem";

interface MessagePaneProps {
  /** Активный диалог (его id); если null — показываем «Выберите чат» */
  selectedId: string | number | null;
  /** Метаданные диалога (имя/логин/идентификатор) */
  dlg?: ChatDialog | null;
  /** Сообщения текущего диалога (могут быть неотсортированными) */
  messages: ChatMessage[];
  /** Флаг фоновой загрузки истории */
  loading?: boolean;
  /** Дозагрузка истории при прокрутке вверх; вернуть true, если были подгружены новые сообщения */
  onLoadMore?: () => Promise<boolean> | boolean;
  /** Отправка текста из инпута */
  onSend?: (text: string) => Promise<void> | void;
  /** Вернуться к списку диалогов (на мобильных) */
  onBack?: () => void;
}

/** Порог близости к верхнему краю (px), при котором триггерим догрузку истории */
const PRELOAD_EDGE = 60 as const;
/** Порог «липкого низа» (px): если ниже — считаем, что пользователь «внизу» */
const STICKY_EDGE = 80 as const;
/** Окно в мс для группировки соседних сообщений одной стороны (отправитель/получатель) */
const GROUP_MS = 5 * 60 * 1000 ;

/**
 * Универсальный парсер даты сообщения.
 * Принимает:
 * - Date — берём getTime()
 * - number — если finite, используем как таймстемп
 * - string — терпим форматы `YYYY-MM-DD HH:mm:ss(.SSS)` и любые ISO-похожие строки
 * Возврат: таймстемп или -Infinity (если значение не читается — полезно для сортировки).
 */
const parseTimestamp = (value: ChatMessage["date"]): number => {
  if (!value) return -Infinity;

  if (value instanceof Date) return value.getTime();

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : -Infinity;
  }

  if (typeof value === "string") {
    // 1) Сначала пробуем как есть — вдруг это полноценный ISO
    const direct = Date.parse(value);
    if (Number.isFinite(direct)) return direct;

    // 2) «Мягкая» нормализация для формата 'YYYY-MM-DD HH:mm:ss(.SSS)'
    const [datePart, timePartRaw] = value.split(" ");
    if (!timePartRaw) return -Infinity;

    const [timePart, fraction = ""] = timePartRaw.split(".");
    const millis = fraction.slice(0, 3).padEnd(3, "0"); // нормализуем до миллисекунд
    const isoCandidate = `${datePart}T${timePart}.${millis}`;
    const parsed = Date.parse(isoCandidate);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  }

  return -Infinity;
};

export default function MessagePane({
  selectedId,
  dlg,
  messages,
  loading = false,
  onLoadMore,
  onSend,
  onBack,
}: MessagePaneProps) {
  /** Контейнер скролла — нужен для вычислений положения и программного скролла */
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  /** Флаг: находимся ли у нижнего края (используем как «прилипание» к новым сообщениям) */
  const atBottomRef = useRef(true);

  /** Технические refs — для аккуратного восстановления позиции после дозагрузки */
  const prevHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);

  /** Локальный ввод текста */
  const [text, setText] = useState("");

  /**
   * Стабильные вычисления: сортируем входящие messages по (date, id, _clientOrder).
   * Почему именно так:
   * - date — главный порядок.
   * - числовой id — помогает стабилизировать порядок сообщений с одинаковым временем (например, из БД).
   * - _clientOrder — дополнительная локальная стабилизация (для «временных» сообщений клиента).
   */
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const timeA = parseTimestamp(a.date);
      const timeB = parseTimestamp(b.date);
      if (timeA !== timeB) return timeA - timeB;

      const idA = typeof a.id === "number" ? a.id : Number.MAX_SAFE_INTEGER;
      const idB = typeof b.id === "number" ? b.id : Number.MAX_SAFE_INTEGER;
      if (idA !== idB) return idA - idB;

      const orderA = typeof a._clientOrder === "number" ? a._clientOrder : 0;
      const orderB = typeof b._clientOrder === "number" ? b._clientOrder : 0;
      return orderA - orderB;
    });
  }, [messages]);

  /** Вычисляем «прилипли ли мы к низу» с допуском STICKY_EDGE */
  const computeAtBottom = useCallback((): boolean => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const delta = el.scrollHeight - el.scrollTop - el.clientHeight;
    return delta <= STICKY_EDGE;
  }, []);

  /** Программно скроллим к самому низу (используется на смене диалога и при приходе новых сообщений) */
  const scrollToBottom = useCallback((): void => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  /** Отображаемое имя гостя (фолбэк — «Гость») */
  const guestName = useMemo(() => {
    const first = (dlg?.first_name ?? "").trim();
    const last = (dlg?.last_name ?? "").trim();
    if (first || last) return [first, last].filter(Boolean).join(" ");
    return "Гость";
  }, [dlg]);

  /** Юзернейм/идентификатор гостя для статуса под именем */
  const guestUsername = useMemo(() => {
    if (dlg?.username) return `@${dlg.username}`;
    const identifier = dlg?.chat_id ?? selectedId;
    return identifier ? `@id${identifier}` : "";
  }, [dlg, selectedId]);

  /**
   * При смене диалога:
   * - сбрасываем ввод
   * - подскролливаем к низу (после монтирования контента, через rAF)
   */
  useEffect(() => {
    if (!selectedId) return;
    requestAnimationFrame(scrollToBottom);
    setText("");
  }, [selectedId, scrollToBottom]);

  /**
   * Новые сообщения:
   * - если пользователь был у нижнего края (atBottomRef) — мягко скроллим вниз
   * - если пользователь листал историю — не трогаем позицию
   */
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (atBottomRef.current) {
      requestAnimationFrame(scrollToBottom);
    }
  }, [sortedMessages, scrollToBottom]);

  /**
   * Обработчик прокрутки:
   * - обновляем atBottomRef
   * - при достижении PRELOAD_EDGE сверху и отсутствии загрузки — вызываем onLoadMore()
   * - если история подгрузилась — восстанавливаем визуальный offset, чтобы «не прыгнуло»
   */
  const handleScroll = useCallback(
    async (event: UIEvent<HTMLDivElement>): Promise<void> => {
      const el = event.currentTarget;
      atBottomRef.current = computeAtBottom();

      if (onLoadMore && el.scrollTop <= PRELOAD_EDGE && !loading) {
        prevHeightRef.current = el.scrollHeight;
        prevScrollTopRef.current = el.scrollTop;

        try {
          const loaded = await onLoadMore();
          if (loaded) {
            requestAnimationFrame(() => {
              const now = scrollContainerRef.current;
              if (!now) return;
              const diff = now.scrollHeight - prevHeightRef.current;
              now.scrollTop = prevScrollTopRef.current + diff;
            });
          }
        } catch (error) {
          // В реальном проекте можно прокинуть в трекинг/логгер
          console.error(error);
        }
      }
    },
    [computeAtBottom, loading, onLoadMore]
  );

  /**
   * Отправка сообщения:
   * - пустые строки игнорируем
   * - после отправки очищаем инпут и скроллим вниз
   * Важно: onSend может быть синхронным или асинхронным — мы не блокируем UI.
   */
  const doSend = useCallback((): void => {
    const value = text.trim();
    if (!value || !selectedId) return;

    try {
      void onSend?.(value);
    } finally {
      setText("");
      requestAnimationFrame(scrollToBottom);
    }
  }, [onSend, scrollToBottom, selectedId, text]);

  /** Горячая клавиша: Enter — отправка, Shift+Enter — перенос строки */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        doSend();
      }
    },
    [doSend]
  );

  if (!selectedId) {
    return (
      <div className="text-center pt-[50%] text-white/30">
        Выберите чат
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Шапка диалога (имя/юзернейм/кнопка «Назад» на мобилках) */}
      <div className="sticky top-0 z-20 bg-transparent px-2 lg:px-8">
        <div className="flex flex-col md:pt-6">
          <div className="flex items-center gap-2 min-w-0 shadowCart py-4 px-4 rounded-3xl">
            {typeof onBack === "function" && (
              <button
                type="button"
                onClick={onBack}
                className="w-fit p-2 -ml-1 bg-transparent md:hidden opacity-60 hover:opacity-40 active:opacity-80"
                aria-label="Назад к чатам"
              >
                <img src={backIcon} alt="Назад" className="w-3" />
              </button>
            )}

            <div className="flex flex-col min-w-0">
              <div className="font-medium text-white/40 truncate">
                {guestName}
              </div>
              {guestUsername && (
                <div className="text-body text-white/20 truncate">
                  {guestUsername}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Лента сообщений + бесконечная прокрутка вверх */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 px-4 lg:px-10 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch] min-w-0"
      >
        <div className="w-full pt-3 pb-[72px] flex flex-col gap-1">
          {loading && sortedMessages.length === 0 ? (
            <div className="text-center text-gray-400 mt-12">
              Загрузка сообщений...
            </div>
          ) : sortedMessages.length === 0 ? (
            <div className="text-center text-gray-400 mt-12">
              В этом чате пока нет сообщений
            </div>
          ) : (
            sortedMessages.map((message, index) => {
              const previous = sortedMessages[index - 1];
              const next = sortedMessages[index + 1];

              const prevSame =
                Boolean(previous) &&
                Boolean(previous?.from_me) === Boolean(message.from_me) &&
                Math.abs(
                  parseTimestamp(message.date) -
                    parseTimestamp(previous?.date)
                ) < GROUP_MS;

              const nextSame =
                Boolean(next) &&
                Boolean(next?.from_me) === Boolean(message.from_me) &&
                Math.abs(
                  parseTimestamp(next?.date) -
                    parseTimestamp(message.date)
                ) < GROUP_MS;

              let position: MessageBubblePosition = "single";
              if (prevSame && nextSame) position = "middle";
              else if (!prevSame && nextSame) position = "start";
              else if (prevSame && !nextSame) position = "end";

              return (
                <MessageBubble
                  key={(
                    message.id ??
                    message._tempId ??
                    `${message.date}-${index}`
                  ).toString()}
                  msg={message}
                  position={position}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Поле ввода + кнопка отправки (плавающая панель над safe-area) */}
      <div className="absolute px-2 lg:px-8 bottom-6 z-10 w-full mt-8">
        <div className="relative flex items-center">
          <textarea
            className="flex-1 resize-none rounded-full bg-[#484B63] placeholder-white/50 text-white/50 px-6 py-3 pr-12 text-body leading-[normal] focus:outline-none"
            rows={1}
            placeholder="Сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!selectedId}
            aria-label="Поле ввода сообщения"
          />

          <button
            type="button"
            onClick={doSend}
            disabled={!selectedId || !text.trim()}
            className={`absolute right-4 top-1/2 -translate-y-1/2 bg-transparent p-0 border-0 shadow-none ring-0 transition ${
              !selectedId || !text.trim()
                ? "cursor-not-allowed opacity-10"
                : "hover:opacity-50"
            }`}
            aria-label="Отправить"
          >
            <img
              src={sendIcon}
              alt="Отправить"
              className="w-5 h-5 pointer-events-none select-none opacity-60"
            />
          </button>
        </div>
      </div>

      {/* Поддержка safe-area на устройствах с «подбородком» */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
