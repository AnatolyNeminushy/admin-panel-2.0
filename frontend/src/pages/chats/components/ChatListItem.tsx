/**
 * Карточка диалога в списке чатов.
 *
 * Зачем этот компонент:
 * - Рендерит один item со всей базовой информацией: аватар платформы, ФИО/ник, ID и метку времени.
 * - Поддерживает выделение выбранного диалога и клики по строке.
 *
 * Что важно:
 * - Используем явную типизацию пропсов и возвращаемого значения (без React.FC), чтобы избежать
 *   неявного children и упростить контроль над сигнатурой компонента.
 * - Аккуратно формируем имя и username с учётом грязных/пустых данных (trim + fallback).
 * - Аксессибилити: `role="option"` и `aria-selected` помогают навигации скринридеров в списках.
 * - Вёрстка на Tailwind: все состояния/псевдоэлементы описаны классами, чтобы устранить инлайн-стили.
 * - Нюанс: горизонтальный разделитель нарисован через псевдоэлемент `:after` — это упрощает поддержку
 *   (не плодим дополнительные DOM-элементы).
 */

import vkLogo from "@/assets/images/social/vk.png";
import tgLogo from "@/assets/images/social/tg.jpg";
import { type JSX } from "react";

export interface ChatDialog {
  chat_id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  /** Платформа: влияет на логотип/alt. При отсутствии — дефолтимся к "tg". */
  platform?: "vk" | "tg";
  /** Дополнительные поля, которые могут прилететь из API (сохраняем расширяемость) */
  [key: string]: unknown;
}

interface ChatListItemProps {
  /** Объект диалога с метаданными по собеседнику */
  dlg: ChatDialog;
  /** Флаг визуального выделения строки (активный диалог) */
  selected: boolean;
  /** Коллбэк выбора строки; наружу прокидываем chat_id, чтобы не тащить весь объект */
  onSelect: (chatId: number | string) => void;
  /** Текстовая метка последней активности/сообщения (форматирование — на стороне родителя) */
  lastDate?: string;
}

/** Вспомогательная утилита для конкатенации классов без внешних зависимостей */
function cn(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const ChatListItem = ({ dlg, selected, onSelect, lastDate }: ChatListItemProps): JSX.Element => {
  // Безопасно определяем платформу (если поле отсутствует/пустое — используем "tg")
  const platform = (dlg.platform ?? "tg") as "vk" | "tg";
  const platformLogo = platform === "vk" ? vkLogo : tgLogo;
  const platformAlt = platform === "vk" ? "VK logo" : "Telegram logo";

  // Санитизируем ФИО: убираем лишние пробелы и подставляем запасной вариант
  const firstName = (dlg.first_name ?? "").trim();
  const lastName = (dlg.last_name ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Гость";

  // Ник: если username отсутствует/пустой — показываем @id{chat_id}
  const username =
    (dlg.username && ((): string => {
      const clean = String(dlg.username).trim();
      return clean ? `@${clean}` : "";
    })()) || `@id${dlg.chat_id}`;

  return (
    <div
      className={cn(
        "relative w-full select-none group pl-4",
        // Выбранный — постоянный приглушённый фон; не выбранный — hover/active состояния
        selected ? "bg-white/10" : "hover:bg-white/5 active:bg-black/5",
        "transition-colors duration-150 ease-out",
        // Разделитель снизу: псевдоэлемент вместо дополнительного DOM-узла
        "after:content-[''] after:absolute after:left-20 after:right-0 after:bottom-0 after:h-px after:bg-white/10",
      )}
    >
      <button
        type="button"
        role="option"
        aria-selected={selected}
        aria-label={`Открыть диалог с ${fullName}`}
        onClick={() => onSelect(dlg.chat_id)}
        className="w-full text-left flex items-center gap-3 px-4 py-3 bg-transparent focus:outline-none"
      >
        <img
          src={platformLogo}
          alt={platformAlt}
          className="w-10 h-10 rounded-full object-cover shrink-0 opacity-70"
          loading="lazy"
          decoding="async"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <div className="font-medium text-white/60 truncate">{fullName}</div>
            {lastDate ? (
              <div className="ml-auto text-body text-white/10 shrink-0">{lastDate}</div>
            ) : null}
          </div>

          <div className="text-body text-white/40 truncate">{username}</div>

          {/* ID показываем явно: бывает полезно для отладки и ручной навигации */}
          <div className="text-body text-white/20 truncate">ID: {dlg.chat_id}</div>
        </div>
      </button>
    </div>
  );
};

export default ChatListItem;
