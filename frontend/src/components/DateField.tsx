import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useCallback,
  type Ref,
} from "react";
import type { InputHTMLAttributes } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { format, parse, isValid, isAfter, isBefore } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Компонент «поле даты с календарём» (ручной ввод + popover-выбор).
 *
 * Что делает и зачем:
 * - Даёт привычный UX: можно печатать `дд.мм.гггг`, а можно выбрать дату кликом в календаре.
 * - Поддерживает как контролируемый (`value`) режим, так и неконтролируемый (`defaultValue`).
 * - Отдаёт наружу значение в ISO-формате `YYYY-MM-DD`, совместимое с обычным `<input type="date">`.
 * - Умеет ограничивать выбор через `min`/`max` (строки ISO). Это важно для валидации форм и бизнес-ограничений.
 * - Акцентный цвет календаря настраивается через `accentColor` без зависимости от конкретной дизайн-системы.
 *
 * Дружелюбные подсказки будущему читателю:
 * - Поле — обычный `<input type="text">` с маской-подсказкой. Это сделано осознанно: браузерные date-пикеры ведут себя по-разному.
 * - Обновление наружу идёт только при валидной дате и в пределах `min/max`. Невалидный ввод не ломает текущее значение.
 * - Календарь закрывается по клику вне, `Esc` и `Enter`. Кнопка имеет правильные aria-атрибуты.
 *
 * Неочевидные моменты:
 * - Мы храним «отображаемый текст» (`text`) отдельно от «валидной даты» (`date`). Это позволяет пользователю печатать,
 *   не теряя предыдущее валидное значение до момента коммита (blur/Enter) — UX как в лучших продуктах.
 * - `accentColor` применяется через проп `styles` библиотеки `react-day-picker`, чтобы не полагаться на конкретные utility-классы.
 */

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value" | "defaultValue" | "min" | "max"
> & {
  label?: string;
  /** Строка 'YYYY-MM-DD' как у обычного `<input type="date">` */
  value?: string;
  defaultValue?: string;
  /**
   * onChange в стиле обычного input: отдаём ISO-строку или `undefined` (когда очистили).
   * Поддержан `name` — он прокидывается в target.
   */
  onChange?: (e: { target: { value: string | undefined; name?: string } }) => void;
  /** Цвет акцента календаря (например, брендовый). По умолчанию — мятный. */
  accentColor?: string;
  /** Границы выбора — строго ISO 'YYYY-MM-DD' */
  min?: string;
  max?: string;
};

const ISO = "yyyy-MM-dd";
const DISPLAY = "dd.MM.yyyy";

/** Парс строки YYYY-MM-DD в Date */
function parseIsoDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, ISO, new Date());
  return isValid(d) ? d : undefined;
}

/** Форматируем Date в YYYY-MM-DD */
function fmtIsoDate(d?: Date): string | undefined {
  return d ? format(d, ISO) : undefined;
}

/** Парс видимой строки dd.MM.yyyy в Date */
function parseDisplay(v: string): Date | undefined {
  const d = parse(v.trim(), DISPLAY, new Date());
  return isValid(d) ? d : undefined;
}

/** Проверка min/max (включительно) */
function withinBounds(d: Date, min?: Date, max?: Date) {
  if (min && isBefore(d, min)) return false;
  if (max && isAfter(d, max)) return false;
  return true;
}

/** Безопасно установить ref (поддерживает и колбэк, и объектный ref) */
export function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") ref(value as T);
  else (ref as { current: T | null }).current = value;
}

const DateField = forwardRef<HTMLInputElement, Props>(function DateField(
  {
    label,
    className = "",
    name,
    value,
    defaultValue,
    onChange,
    min,
    max,
    accentColor = "#17E1B1",
    ...props
  },
  forwardedRef
) {
  const wrapperRef = useRef<HTMLLabelElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = internalInputRef; // храним реальный DOM-ref тут
  const [open, setOpen] = useState(false);

  // Контролируемое/неконтролируемое
  const controlled = value !== undefined;
  const [inner, setInner] = useState<Date | undefined>(() => parseIsoDate(defaultValue));
  const date = controlled ? parseIsoDate(value) : inner;

  // Текст в инпуте для ручного ввода
  const [text, setText] = useState<string>(date ? format(date, DISPLAY) : "");

  // Границы
  const minDate = useMemo(() => parseIsoDate(min), [min]);
  const maxDate = useMemo(() => parseIsoDate(max), [max]);

  // Синхронизируем текст, если дата поменялась извне
  useEffect(() => {
    setText(date ? format(date, DISPLAY) : "");
  }, [date]);

  // Пробрасываем внешний ref на реальный input
  useEffect(() => {
    setRef(forwardedRef, inputRef.current);
  }, [forwardedRef]);

  // Отдать наружу строку ISO
  const emit = useCallback(
    (d?: Date) => {
      const v = fmtIsoDate(d);
      onChange?.({ target: { value: v, name } });
    },
    [onChange, name]
  );

  // Выбор даты кликом
  const handleSelect = useCallback(
    (d?: Date) => {
      if (!d) return;
      if (!withinBounds(d, minDate, maxDate)) return;

      if (!controlled) setInner(d);
      emit(d);
      setOpen(false);
      // Вернём фокус на поле, чтобы пользователь мог продолжить печатать
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [controlled, emit, maxDate, minDate]
  );

  // Ручной ввод
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setText(v);

      // Мини-подсказка UX: как только набрали достаточно символов — пробуем распарсить
      if (v.replaceAll(/\D/g, "").length >= 8) {
        const d = parseDisplay(v);
        if (d && withinBounds(d, minDate, maxDate)) {
          if (!controlled) setInner(d);
          emit(d);
          return;
        }
      }
      // Если пока невалидно — не эмитим (value снаружи остаётся прежним)
    },
    [controlled, emit, maxDate, minDate]
  );

  // Подтверждение по blur/Enter
  const commitText = useCallback(() => {
    const raw = text.trim();

    // Пустое — это очистка
    if (!raw) {
      if (!controlled) setInner(undefined);
      emit(undefined);
      return;
    }

    const d = parseDisplay(raw);
    if (d && withinBounds(d, minDate, maxDate)) {
      if (!controlled) setInner(d);
      emit(d);
    } else {
      // Откат к предыдущей валидной дате — важный UX, чтобы не «терять» значение
      setText(date ? format(date, DISPLAY) : "");
    }
  }, [text, controlled, emit, minDate, maxDate, date]);

  // Горячие клавиши
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitText();
        setOpen(false);
      } else if (e.key === "Escape") {
        setOpen(false);
        setText(date ? format(date, DISPLAY) : "");
        inputRef.current?.blur();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Если поле становится пустым и была дата — очистить
        if (text.length <= 1 && date) {
          if (!controlled) setInner(undefined);
          emit(undefined);
        }
      }
    },
    [commitText, date, text.length, controlled, emit]
  );

  // Клик вне — закрыть поповер
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      const wrap = wrapperRef.current;
      if (wrap && !wrap.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const id = useId();
  const buttonId = `${id}-calendar-button`;
  const popoverId = `${id}-calendar-popover`;
  const labelId = `${id}-label`;

  // Ограничения для DayPicker (чтобы визуально отключать недоступные дни)
  const disabled: Matcher | Matcher[] | undefined =
    minDate || maxDate
      ? ([
          minDate ? { before: minDate } : undefined,
          maxDate ? { after: maxDate } : undefined,
        ].filter(Boolean) as Matcher[])
      : undefined;

  // Кастомные классы DayPicker — отвечают за размеры/отступы/контраст,
  // а цвет мы зададим через `styles` (см. ниже).
  const dpClassNames = {
    root: "rdp",
    nav: "flex gap-1 mb-2",
    caption_label: "text-white/70 font-medium",
    button_previous:
      "bg-white/20 hover:bg-white/30 active:bg-white/10 rounded-lg transition-colors",
    button_next: "bg-white/20 hover:bg-white/30 active:bg-white/10 rounded-lg transition-colors",
    head_cell: "text-white/60 font-medium",
    weekdays: "text-white/60 font-semibold",
    table: "w-full",
    // обёртка дня
    day: "rounded-xl text-white/50 hover:bg-white/5 text-center transition",
    // сам кликбельный элемент дня
    day_button: "h-8 w-8 grid place-items-center rounded-full",
    // выбранный день — цвет задаём через styles.day_selected
    selected: "bg-primary/10 text-primary/60",
    // «сегодня»
    today: "ring-1 ring-white/20 rounded-xl",
    // недоступные дни
    day_disabled: "opacity-30 cursor-not-allowed",
  } as const;

  // Цветовая схема DayPicker через инлайн-стили (независимо от Tailwind конфигурации)
  const dpStyles = {
    day_button: {
      color: "inherit",
    },
    day_selected: {
      backgroundColor: `${accentColor}`,
      color: "#071126",
    },
    day_selected_range_middle: {
      backgroundColor: `${accentColor}`,
      color: "#071126",
    },
    day_selected_range_start: {
      backgroundColor: `${accentColor}`,
      color: "#071126",
    },
    day_selected_range_end: {
      backgroundColor: `${accentColor}`,
      color: "#071126",
    },
  } as const;

  return (
    <label className="flex flex-col gap-1 text-body" ref={wrapperRef}>
      {label && (
        <span className="text-body text-white/80 select-none" id={labelId}>
          {label}
        </span>
      )}

      <div className="relative">
        {/* Поле для ручного ввода даты. Подсказка: можно печатать, а можно кликнуть по иконке. */}
        <input
          ref={inputRef}
          name={name}
          aria-labelledby={label ? labelId : undefined}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="дд.мм.гггг"
          pattern="\d{2}\.\d{2}\.\d{4}"
          onFocus={() => setOpen(true)}
          onChange={onInputChange}
          onBlur={commitText}
          onKeyDown={onKeyDown}
          value={text}
          className={[
            "w-full rounded-xl bg-[#09102a]/100",
            "pl-3 pr-9 py-2",
            "text-white/90 placeholder-white/40 outline-none",
            className,
          ].join(" ")}
          {...props}
        />

        {/* Кнопка-иконка календаря (не мешает таб-навигации) */}
        <button
          id={buttonId}
          type="button"
          aria-label="Открыть календарь"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-lg outline-none hover:bg-white/5 active:bg-white/10"
          onClick={() => setOpen((v) => !v)}
          tabIndex={0}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/60">
            <path
              fill="currentColor"
              d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zm14 9v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7h18z"
            />
          </svg>
        </button>

        {/* Popover с календарём: позиционируем относительно поля */}
        {open && (
          <div
            id={popoverId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={label ? labelId : undefined}
            className="absolute z-50 mt-2 min-w-[300px] rounded-2xl bg-[#0b122d] p-2 shadow-2xl"
            style={{
              // небольшой отступ цвета акцента для внутренних элементов
              // (используемся в dpStyles выше)
              border: `1px solid ${accentColor}20`,
            }}
          >
            <DayPicker
              mode="single"
              selected={date}
              onSelect={handleSelect}
              locale={ru}
              weekStartsOn={1}
              showOutsideDays
              className="rdp !text-body"
              classNames={dpClassNames}
              styles={dpStyles}
              // Граничим выбор и визуально отключаем недоступные дни
              disabled={disabled}
              // Если проект на DayPicker v9+, можно дополнительно использовать fromDate/toDate:
              // ts-expect-error — пропы зависят от версии библиотеки, оставляем как подсказку.
              fromDate={minDate}
              // ts-expect-error — см. комментарий выше.
              toDate={maxDate}
            />
          </div>
        )}
      </div>

      {/* Скрытый ISO для форм (удобно при обычной сериализации formData) */}
      <input
        type="hidden"
        name={name ? `${name}__iso` : undefined}
        value={fmtIsoDate(date) ?? ""}
      />
    </label>
  );
});

export default DateField;
