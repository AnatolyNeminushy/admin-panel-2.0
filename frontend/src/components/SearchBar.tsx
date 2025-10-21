import { type ChangeEvent, type KeyboardEvent, type ReactElement } from "react";
import SearchIcon from "@/assets/icons/general/SearchIcon.svg";

/**
 * Компонент: поле поиска по чатам (ChatSearch).
 *
 * Зачем:
 * - Позволяет быстро фильтровать список диалогов по вводу пользователя.
 * - Поддерживает коллбэки для изменения значения, отправки (по Enter) и очистки.
 * - Имеет «компактный» режим без вспомогательной кнопки сброса.
 *
 * Особенности реализации:
 * - Семантика доступности: корневой контейнер помечен `role="search"` и получает осмысленную
 *   подпись через `aria-label`, чтобы скринридеры трактовали область как поиск.
 * - Иконка лупы — чисто декоративная: `alt=""` и `aria-hidden`, чтобы её не озвучивали.
 * - Управление с клавиатуры: Enter отправляет запрос (onSubmit), Escape сбрасывает фильтр (onClear).
 * - Управляемый инпут: состояние хранится снаружи, компонент получает value + onChange.
 * - Tailwind-классы сгруппированы так, чтобы визуальный стиль был консистентным в 2025:
 *   читаемые отступы, аккуратный backdrop-blur, фокус-стили и предсказуемые размеры.
 *
 * Подсказки по использованию:
 * - Передавайте осмысленный placeholder, например «Поиск по диалогам…».
 * - Если вы оборачиваете компонент в форму, не забудьте предотвратить submit страницы,
 *   либо используйте текущую реализацию с onSubmit по Enter без формы.
 */

interface ChatSearchProps {
  /** Текущее значение строки поиска (управляемый инпут). */
  value: string;
  /** Коллбэк для обновления значения извне. */
  onChange: (next: string) => void;
  /** Коллбэк отправки: вызывается при нажатии Enter. */
  onSubmit?: () => void;
  /** Коллбэк очистки фильтра/поля. */
  onClear?: () => void;
  /** Плейсхолдер для текстового поля. */
  placeholder?: string;
  /**
   * Компактный режим: скрывает вспомогательную кнопку «Сбросить поиск»,
   * оставляя только поле ввода.
   */
  compact?: boolean;
  /** Внешние классы контейнера для управления шириной/отступами извне. */
  className?: string;
}

export default function ChatSearch({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = "Поиск...",
  compact = false,
  className = "",
}: ChatSearchProps): ReactElement {
  // Обёртка: базовые отступы для встраивания в сетку страницы.
  const wrapperCls = "mb-4 px-4 pt-0 md:p-4";

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    // Enter — запускаем поиск.
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
    }
    // Escape — быстрая очистка (если что-то введено и обработчик задан).
    if (e.key === "Escape" && value) {
      e.preventDefault();
      onClear?.();
    }
  };

  return (
    <section
      role="search"
      aria-label="Поиск по диалогам"
      className={`${wrapperCls} ${className}`.trim()}
    >
      <div className="relative">
        {/* Декоративная иконка лупы (не озвучивается скринридерами) */}
        <img
          src={SearchIcon}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 z-20 h-3 w-3 -translate-y-1/2 opacity-30"
        />

        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={[
            "h-10 w-full rounded-full bg-white/20 py-2 pl-8 pr-3 text-body text-white/90",
            "placeholder-white/40 backdrop-blur-xl outline-none",
            // Чуть более читаемый неактивный текст, чем было в исходнике (было text-white/30).
            "disabled:opacity-50 disabled:cursor-not-allowed",
          ]
            .join(" ")
            .trim()}
          aria-label="Поиск по диалогам"
          inputMode="search"
          autoComplete="off"
        />
      </div>

      {/* Кнопка сброса — показываем только когда есть что очищать и когда не compact */}
      {!compact && value && (
        <button
          type="button"
          className={[
            "mt-2 rounded-full bg-white/10 px-3 py-1 text-body text-white/80",
            "hover:bg-white/15 hover:text-white/90",
            "focus:outline-none focus:ring-2 focus:ring-white/25",
            "active:bg-white/20",
          ]
            .join(" ")
            .trim()}
          onClick={onClear}
          aria-label="Сбросить строку поиска"
        >
          Сбросить поиск
        </button>
      )}
    </section>
  );
}
