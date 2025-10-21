/// pages/database/utils/format.ts
/**
 * Форматирование даты/времени в человеко-читаемую локализованную строку.
 *
 * Зачем это нужно:
 * - Единообразный вывод дат в UI без «плясок» от окружения (SSR/браузер).
 * - Безопасная работа с разными типами входа: Date, ISO-строка, Unix-штамп (сек/мс).
 * - Аккуратная обработка невалидных значений: возвращаем длинное тире «—», а не бросаем исключения.
 *
 * Детали по умолчанию:
 * - Если не передавать опции, формат будет `дд.мм.гг` (короткая дата).
 * - Добавьте `includeTime: true`, чтобы получить `дд.мм.гг чч:мм`.
 * - Передача `dateStyle/timeStyle` включает «старый» режим Intl с полностью кастомными пресетами.
*/

const EMPTY_PLACEHOLDER = "—";

/** Опции высокого уровня над Intl.DateTimeFormat */
export interface DateFormatOptions {
  /** Локаль(и), например "ru-RU" или ["ru-RU","en-GB"]. По умолчанию — ru-RU. */
  locale?: string | string[];
  /** Явный часовой пояс, например "Europe/Warsaw". Очень рекомендуется для SSR. */
  timeZone?: string;
  /** Пресеты формата даты и времени. Комбинируются. */
  dateStyle?: "full" | "long" | "medium" | "short";
  timeStyle?: "full" | "long" | "medium" | "short";
  /** 12-часовой формат (en-US и т.п.). По умолчанию — поведение локали. */
  hour12?: boolean;
  /** Добавить время (часы:минуты) к короткому формату `дд.мм.гг`. */
  includeTime?: boolean;
}

/**
 * Вспомогательная нормализация входного значения в валидный Date.
 * Возвращает null, если значение пустое/невозможно распарсить.
 */
function normalizeToDate(
  value: Date | string | number | null | undefined
): Date | null {
  if (value == null || value === "") return null;

  // Уже Date
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Числовые значения: сек/мс
  if (typeof value === "number" && Number.isFinite(value)) {
    // Эвристика: всё, что меньше 1e12, считаем секундами UNIX.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Строки: доверяем встроенному парсеру ISO/ RFC2822 (или "YYYY-MM-DD" как локальную дату)
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Форматирует дату согласно заданным опциям. Для невалидного входа возвращает «—».
 *
 * Примеры:
 *   fmtDate(1715606400000)                           // "13.05.24"
 *   fmtDate("2025-10-19T12:30:00Z", { includeTime: true }) // "19.10.25 15:30" (зависит от timeZone)
 *   fmtDate(1715606400, { dateStyle: "medium", timeStyle: "short" }) // legacy режим Intl
 */
export function fmtDate(
  value: Date | string | number | null | undefined,
  {
    locale,
    timeZone,
    dateStyle = "medium",
    timeStyle = "short",
    hour12,
    includeTime,
  }: DateFormatOptions = {}
): string {
  const date = normalizeToDate(value);
  if (!date) return EMPTY_PLACEHOLDER;

  const resolvedLocale = locale ?? "ru-RU";

  // Если явно указали стили дат/времени — используем прежнее поведение (совместимость).
  if (dateStyle !== "medium" || timeStyle !== "short") {
    const styleOptions: Intl.DateTimeFormatOptions = {};
    if (timeZone) styleOptions.timeZone = timeZone;
    if (dateStyle) styleOptions.dateStyle = dateStyle;
    if (timeStyle) styleOptions.timeStyle = timeStyle;
    if (typeof hour12 === "boolean") styleOptions.hour12 = hour12;

    try {
      return new Intl.DateTimeFormat(resolvedLocale, styleOptions).format(date);
    } catch {
      try {
        return new Intl.DateTimeFormat(undefined, styleOptions).format(date);
      } catch {
        return date.toLocaleString();
      }
    }
  }

  // Новый короткий формат для таблиц: `дд.мм.гг` (+ ` чч:мм` при includeTime).
  const shortOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  };
  if (timeZone) shortOptions.timeZone = timeZone;
  if (includeTime) {
    shortOptions.hour = "2-digit";
    shortOptions.minute = "2-digit";
  }
  if (typeof hour12 === "boolean") shortOptions.hour12 = hour12;

  try {
    if (includeTime) {
      const formatter = new Intl.DateTimeFormat(resolvedLocale, shortOptions);
      const parts = formatter.formatToParts(date);
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value;
      const day = get("day");
      const month = get("month");
      const year = get("year");
      const hour = get("hour");
      const minute = get("minute");
      if (day && month && year && hour && minute) {
        return `${day}.${month}.${year} ${hour}:${minute}`;
      }
      // Если почему-то не нашли части — откат к полной строке.
      return formatter.format(date);
    }

    return new Intl.DateTimeFormat(resolvedLocale, shortOptions).format(date);
  } catch {
    try {
      const fallbackFormatter = new Intl.DateTimeFormat(undefined, shortOptions);
      const formatted = fallbackFormatter.format(date);
      if (includeTime) return formatted;
      return formatted;
    } catch {
      const yyyy = date.getFullYear().toString().slice(-2);
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      if (includeTime) {
        const hh = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
      }
      return `${dd}.${mm}.${yyyy}`;
    }
  }
}
