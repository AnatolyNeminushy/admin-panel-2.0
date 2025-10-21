import { useEffect, useMemo, useState, type ReactNode } from "react";
import ChatListItem, { type ChatDialog } from "./ChatListItem";
import { getDialogTimestamp, type DialogLike } from "../utils/chatUtils";

/**
 * Список чатов c плавным появлением элементов и адаптивным форматом времени.
 *
 * Зачем этот файл:
 * - Отрисовывает коллекцию диалогов и подсвечивает выбранный.
 * - Форматирует "последнюю активность" (lastDate) по-разному для мобильных и десктопов.
 * - Добавляет микро-анимацию появления карточек (дружелюбнее для пользователя).
 *
 * Почему так устроено:
 * - Хук `useMediaQuery` написан без внешних зависимостей и использует современный API
 *   `addEventListener` с `AbortController` для отписки. Есть безопасный fallback для очень старых Safari.
 * - Карточки проявляются плавно независимо от системной настройки «уменьшение движения».
 * - Вёрстка допускает SSR: обращение к `window` обёрнуто проверками окружения.
 */

/* =========================
 *   Хуки окружения / медиазапросов
 * ========================= */

/**
 * Подписка на media query c современным API и безопасной отпиской.
 * Возвращает true/false в зависимости от соответствия запросу.
 * Под капотом:
 * - При наличии `addEventListener` используем его + AbortController (современный способ).
 * - Если его нет (очень старый Safari) — аккуратно падаем на `addListener/removeListener`.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Современный путь: addEventListener + AbortController для автоматической отписки
    if (typeof mql.addEventListener === "function") {
      const controller = new AbortController();
      mql.addEventListener("change", onChange, { signal: controller.signal });
      return () => controller.abort();
    }

    // Fallback для очень старых Safari (API помечен как устаревший, но всё ещё встречается)
    // Здесь осознанно используем старые методы — исключительно как запасной план.
    // ts-expect-error — старый WebKit без addEventListener
    mql.addListener(onChange);
    return () => {
      // ts-expect-error — старый WebKit без removeEventListener
      mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/* =========================
 *   Мелкая утилита-анимация
 * ========================= */

interface AnimatedItemProps {
  children: ReactNode;
  /** Задержка старта анимации в мс (каскадное появление списка) */
  delay?: number;
  /** Длительность анимации в мс */
  durationMs?: number;
}

/**
 * Контейнер, который плавно проявляет содержимое независимо от системных настроек motion.
 */
function AnimatedItem({
  children,
  delay = 0,
  durationMs = 600,
}: AnimatedItemProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const raf = requestAnimationFrame(() => {
      timeout = setTimeout(() => setShown(true), delay);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
    };
  }, [delay]);

  const style = useMemo<React.CSSProperties>(
    () => ({
      transitionDuration: `${durationMs}ms`,
    }),
    [durationMs]
  );

  return (
    <div
      style={style}
      className={[
        "transition-all ease-out transform-gpu",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* =========================
 *   Типы пропсов / моделей
 * ========================= */

interface ChatListProps {
  /** Коллекция диалогов для отрисовки */
  dialogs: Array<ChatDialog & DialogLike>;
  /** Идентификатор выбранного диалога (подсветка активного) */
  selectedId?: string | number | null;
  /** Колбэк выбора диалога */
  onSelect: (chatId: string | number) => void;
}

/* =========================
 *   Основной компонент
 * ========================= */

export default function ChatList({
  dialogs,
  selectedId,
  onSelect,
}: ChatListProps) {
  const MOBILE_QUERY = "(max-width: 920px)";
  const isMobile = useMediaQuery(MOBILE_QUERY);

  if (!dialogs?.length) {
    return <div className="text-center text-white/30 pt-[50%]">Нет диалогов</div>;
  }

  return (
    // ARIA: роль listbox подразумевает, что дочерние элементы — "option".
    // Компонент ChatListItem должен выставлять role="option" и aria-selected.
    <div role="listbox" className="flex flex-col">
      <div className="h-px bg-white/10 ml-[78px]" />

      {dialogs.map((dlg, i) => {
        const ts = getDialogTimestamp(dlg);
        let lastDate = "";

        // Преобразуем timestamp в локализованную строку; если ts<=0 — дата неизвестна.
        if (ts > 0) {
          const d = new Date(ts);
          lastDate = d.toLocaleString(
            "ru-RU",
            isMobile
              ? { hour: "2-digit", minute: "2-digit", hour12: false }
              : {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }
          );
        }

        // Каскадная задержка появления, ограничиваем верхнюю границу.
        const delay = Math.min(i * 30, 240);

        return (
          <AnimatedItem key={dlg.chat_id} delay={delay} durationMs={700}>
            <ChatListItem
              dlg={dlg}
              selected={selectedId === dlg.chat_id}
              onSelect={onSelect}
              lastDate={lastDate}
            />
          </AnimatedItem>
        );
      })}
    </div>
  );
}
