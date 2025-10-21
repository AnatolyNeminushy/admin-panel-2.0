/**
 * Ютилиты для работы со списком диалогов.
 *
 * Зачем это нужно:
 * - В разных источниках (боты, сторонние API, старые версии БД) дата последней активности
 *   может храниться по-разному: в миллисекундах/секундах от эпохи, в ISO-строке, как Date-объект
 *   или глубоко в lastMessage. Нам важно унифицировать это в *число миллисекунд*.
 * - Быстрый локальный поиск по нескольким "визиткам" диалога (username, имя/фамилия, chat_id)
 *   без похода в сервер.
 *
 * На что обратить внимание:
 * - Числовые даты иногда приходят в секундах, а иногда уже в миллисекундах. Мы аккуратно
 *   нормализуем обе формы (см. toUnixMs).
 * - Поиск нормализует строку: приводим к нижнему регистру, применяем Unicode Normalization (NFKD)
 *   и убираем диакритические знаки. Так "Świątek" будет найден по "swiatek".
 * - Интерфейс DialogLike гибкий: мы не меняем входные данные, только читаем их (readonly).
 */

/** Унифицированный вид таймстемпа, который готовы принять на вход. */
export type TimestampInput = string | number | Date;

/** "Похож на диалог" объект из разных источников данных. */
export interface DialogLike {
  readonly last_ts?: TimestampInput;
  readonly last_message_date?: TimestampInput;
  readonly lastMessageAt?: TimestampInput;
  readonly updated_at?: TimestampInput;
  readonly updatedAt?: TimestampInput;
  readonly last_activity?: TimestampInput;
  readonly lastActivity?: TimestampInput;
  readonly lastMessage?: {
    readonly date?: TimestampInput;
    [key: string]: unknown;
  };
  readonly username?: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly chat_id?: string | number;
  [key: string]: unknown;
}

/**
 * Приватно: безопасно преобразует разные форматы времени к unix-мс.
 * Поддерживает:
 * - Date: берём getTime()
 * - number: если меньше 1e12 считаем секундами и умножаем на 1000, иначе — уже миллисекунды
 * - string: делегируем Date.parse (ISO, RFC2822, или строка-число), далее те же правила, что и для number
 */
function toUnixMs(input: TimestampInput): number {
  if (input instanceof Date) {
    const ms = input.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof input === "number") {
    // Эвристика: 10^12 ≈ 2001-09-09T01:46:40Z в мс. Всё меньше — скорее всего секунды.
    const ms = input < 1_000_000_000_000 ? input * 1000 : input;
    return Number.isFinite(ms) ? ms : 0;
  }

  // Строка: пробуем как число, иначе как дату
  const trimmed = input.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && trimmed !== "") {
    return toUnixMs(numeric);
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Возвращает время последнего обновления диалога в миллисекундах с эпохи.
 * Если ничего валидного не найдено — 0.
 */
export function getDialogTimestamp(dialog: DialogLike | null | undefined): number {
  const source: TimestampInput | null =
    dialog?.last_ts ??
    dialog?.last_message_date ??
    dialog?.lastMessageAt ??
    dialog?.updated_at ??
    dialog?.updatedAt ??
    dialog?.last_activity ??
    dialog?.lastActivity ??
    dialog?.lastMessage?.date ??
    null;

  if (source == null) return 0;

  const timestamp = toUnixMs(source);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Приватно: безопасно нормализуем любые значения к подстроке для поиска. */
function normalizeForSearch(value: unknown): string {
  if (value == null) return "";
  // Приводим к строке
  const s = String(value);
  // Трим, нижний регистр (locale-aware) и Unicode Normalization
  // Затем убираем диакритические знаки, чтобы поиск был дружелюбнее.
  return s
    .trim()
    .toLocaleLowerCase("und") // "und" — язык не указан, максимально нейтральная case-fold эвристика
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

/**
 * Проверяет, подходит ли диалог под локальный поиск по username/имени/фамилии/chat_id.
 * Поиск нечувствителен к регистру и диакритике, игнорирует лишние пробелы.
 */
export function matchesLocal(dialog: DialogLike, term: string): boolean {
  const query = normalizeForSearch(term);
  if (query.length === 0) return true;

  const fields = [
    dialog.username,
    dialog.first_name,
    dialog.last_name,
    dialog.chat_id, // число тоже поддержим — toString внутри normalizeForSearch
  ];

  // includes на нормализованных значениях — быстрый подстрочный матч
  return fields.some((f) => normalizeForSearch(f).includes(query));
}
