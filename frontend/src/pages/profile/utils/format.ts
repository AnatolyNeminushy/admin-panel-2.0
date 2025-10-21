/**
 * Утилита форматирования дат для UI профиля.
 *
 * Зачем это нужно:
 * - Приводим любые входные значения (Date | string | number) к удобочитаемой строке.
 * - Безопасно обрабатываем пустые/битые значения — показываем «—», а не "Invalid Date".
 * - Единообразно форматируем по Locale/таймзоне, не полагаясь на непредсказуемый toLocaleString().
 */

export type DateInput = Date | string | number | null | undefined;

export type FmtOptions = {
  /**
   * Locale(ы) для форматирования. Оставьте пустым — возьмём локаль среды исполнения.
   * Пример: 'ru-RU' | ['ru-RU', 'en-GB']
   */
  locale?: string | string[];
  /** Стратегии форматирования даты/времени: 'short' | 'medium' | 'long' | 'full' */
  dateStyle?: 'short' | 'medium' | 'long' | 'full';
  timeStyle?: 'short' | 'medium' | 'long' | 'full';
  /** Таймзона в формате IANA. Пример: 'Europe/Berlin' */
  timeZone?: string;
  /** 12-часовой формат (true) или 24-часовой (false). По умолчанию — автоматика локали. */
  hour12?: boolean;
};

const EMPTY_FALLBACK = '—' as const;

// Базовые дефолты для UI-профиля: компактная дата + короткое время.
const DEFAULT_OPTIONS = {
  dateStyle: 'medium',
  timeStyle: 'short',
} satisfies Intl.DateTimeFormatOptions;

/**
 * Кэш форматтеров: пересоздание Intl.DateTimeFormat стоит дорого, поэтому мемоизируем
 * по "ключу настроек". Это помогает при большом числе одинаковых рендеров.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: FmtOptions['locale'],
  opts: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  // Формируем стабильный ключ. locale может быть массивом — нормализуем к строке.
  const localeKey = Array.isArray(locale) ? locale.join(',') : locale ?? '';
  const key = `${localeKey}::${JSON.stringify(opts)}`;

  const cached = formatterCache.get(key);
  if (cached) return cached;

  const fmt = new Intl.DateTimeFormat(locale as any, opts);
  formatterCache.set(key, fmt);
  return fmt;
}

/**
 * Пробуем превратить "что угодно" в валидный Date.
 * Особый случай — числовые timestamp'ы: если похоже на секунды, умножаем на 1000.
 * Это спасает от типичной ошибки, когда бекенд шлёт секунды.
 */
function normalizeToDate(value: DateInput): Date | null {
  if (value == null) return null;

  // Уже Date — просто проверим валидность.
  if (value instanceof Date) return isValidDate(value) ? value : null;

  // Пустая строка после trim — считаем отсутствующим значением.
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return null;

    // Чисто числовая строка — трактуем как timestamp.
    if (/^-?\d+$/.test(s)) {
      const n = Number(s);
      const ms = looksLikeSeconds(n) ? n * 1_000 : n;
      const d = new Date(ms);
      return isValidDate(d) ? d : null;
    }

    // Иначе — отдадим парсеру Date (ISO, RFC и т.п.).
    const d = new Date(s);
    return isValidDate(d) ? d : null;
  }

  if (typeof value === 'number') {
    const ms = looksLikeSeconds(value) ? value * 1_000 : value;
    const d = new Date(ms);
    return isValidDate(d) ? d : null;
  }

  return null;
}

function isValidDate(d: Date): boolean {
  // valueOf() даёт timestamp — NaN у невалидных дат.
  return Number.isFinite(d.valueOf());
}

// Эвристика: "короткие" timestamp'ы (меньше 1e12 по модулю) — вероятно секунды.
function looksLikeSeconds(n: number): boolean {
  const abs = Math.abs(n);
  return abs > 0 && abs < 1_000_000_000_000;
}

/**
 * Универсальное форматирование даты/времени.
 * Возвращает «—» для null/пустых/невалидных значений.
 */
export function fmtDateTime(value: DateInput, options: FmtOptions = {}): string {
  const date = normalizeToDate(value);
  if (!date) return EMPTY_FALLBACK;

  const { locale, ...rest } = options;
  const fmt = getFormatter(locale, { ...DEFAULT_OPTIONS, ...rest });
  return fmt.format(date);
}

/**
 * Форматирует ТОЛЬКО дату (без времени). Удобно для "Дата рождения", "Создано" и т.п.
 */
export function fmtDate(value: DateInput, options: Omit<FmtOptions, 'timeStyle'> = {}): string {
  const date = normalizeToDate(value);
  if (!date) return EMPTY_FALLBACK;

  const { locale, ...rest } = options;
  const fmt = getFormatter(locale, { dateStyle: 'medium', ...rest, timeStyle: undefined });
  return fmt.format(date);
}

/**
 * Форматирует ТОЛЬКО время (без даты). Удобно для "Последний визит: 14:03".
 */
export function fmtTime(value: DateInput, options: Omit<FmtOptions, 'dateStyle'> = {}): string {
  const date = normalizeToDate(value);
  if (!date) return EMPTY_FALLBACK;

  const { locale, ...rest } = options;
  const fmt = getFormatter(locale, { timeStyle: 'short', ...rest, dateStyle: undefined });
  return fmt.format(date);
}
