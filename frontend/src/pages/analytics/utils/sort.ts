/**
 * Универсальная сортировка коллекций «аналитики».
 *
 * Что делает:
 * - Сортирует массив объектов по одному из ключей: 'guest_name' | 'total_amount' | 'date'.
 * - Сохраняет исходный массив нетронутым (возвращает новый).
 * - Корректно обрабатывает «пустые» значения (undefined/null) — они всегда идут в конец.
 *
 * Почему так:
 * - Для строк используем Intl.Collator с `sensitivity: "base"` — это современный и
 *   локалезависимый способ сравнения без учёта регистра; он устойчивее, чем manual `.toLowerCase()`.
 * - Для чисел и дат безопасно парсим вход: строковые числа → Number, даты → Date.parse.
 *   Некорректные значения считаются «пустыми» и отправляются в конец — это предсказуемо для UI.
 * - Реализован общий компаратор с «nulls last», чтобы поведение было одинаковым для всех типов.
 *
 * Подсказка для будущего читателя:
 * - Если понадобится добавить новый ключ сортировки, см. блок `switch (by)` — добавьте
 *   логику извлечения значений (extract) и компаратор для конкретного типа.
 */

export type SortKey = 'guest_name' | 'total_amount' | 'date' | 'time'
export type SortDirection = 'asc' | 'desc'

export interface SortOptions<By extends SortKey = SortKey> {
  by: By
  dir: SortDirection
}

/**
 * Базовый интерфейс элемента для сортировки.
 * Поля помечены опциональными — массив может содержать неполные записи.
 */
export interface SortableItem {
  guest_name?: string
  total_amount?: number | string | null
  date?: string | number | Date | null
  time?: string | number | Date | null
  // Разрешаем дополнительные поля, чтобы удобно расширять модель без правок утилиты
  [key: string]: unknown
}

/** Коллатор для человеко-понятной сортировки имён: регистр и диакритика игнорируются. */
const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  usage: 'sort',
})

/**
 * Унифицированный компаратор с правилом «пустые значения в конец».
 * Это делает поведение таблиц и списков более дружелюбным: неполные записи не «застревают» сверху.
 */
function compareNullable<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  cmp: (x: T, y: T) => number,
): number {
  const aEmpty = a === null || a === undefined
  const bEmpty = b === null || b === undefined
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  return cmp(a, b)
}

/** Безопасно извлекаем числовое значение; некорректные — как пустые. */
function toNumberSafe(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value
  if (typeof value === 'string') {
    // Мягкий парс строковых чисел; лишние пробелы не помешают
    const n = Number(value.trim())
    return Number.isNaN(n) ? undefined : n
  }
  return undefined
}

/** Безопасно извлекаем timestamp (мс с эпохи); некорректные — как пустые. */
function toTimeSafe(value: unknown): number | undefined {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? undefined : t
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const t = Date.parse(value)
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

/** Преобразуем значение времени в минуты от начала суток; некорректные — как пустые. */
function toDayMinutes(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/)
    if (!match) return undefined
    const hours = Number(match[1])
    const minutes = match[2] !== undefined ? Number(match[2]) : 0
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return undefined
    }
    return hours * 60 + minutes
  }
  return undefined
}

/**
 * Сортировка массива по заданным опциям.
 *
 * Примеры:
 * - sortItems(rows, { by: 'guest_name', dir: 'asc' })
 * - sortItems(rows, { by: 'total_amount', dir: 'desc' })
 * - sortItems(rows, { by: 'date', dir: 'asc' })
 */
export function sortItems<TItem extends SortableItem, By extends SortKey = SortKey>(
  items: readonly TItem[],
  options: Readonly<SortOptions<By>>,
): TItem[] {
  const { by, dir } = options
  const direction = dir === 'asc' ? 1 : -1

  // Клонируем, чтобы не мутировать оригинальный массив (важно для предсказуемости React/запросов)
  const copy = items.slice()

  copy.sort((a, b) => {
    switch (by) {
      case 'guest_name': {
        const av = typeof a.guest_name === 'string' ? a.guest_name : undefined
        const bv = typeof b.guest_name === 'string' ? b.guest_name : undefined

        const result = compareNullable(av, bv, (x, y) => nameCollator.compare(x, y))
        return result * direction
      }

      case 'total_amount': {
        const av = toNumberSafe(a.total_amount)
        const bv = toNumberSafe(b.total_amount)

        const result = compareNullable(av, bv, (x, y) => (x < y ? -1 : x > y ? 1 : 0))
        return result * direction
      }

      case 'date': {
        const av = toTimeSafe(a.date)
        const bv = toTimeSafe(b.date)

        const result = compareNullable(av, bv, (x, y) => (x < y ? -1 : x > y ? 1 : 0))
        return result * direction
      }

      case 'time': {
        const av = toDayMinutes(a.time)
        const bv = toDayMinutes(b.time)

        const result = compareNullable(av, bv, (x, y) => (x < y ? -1 : x > y ? 1 : 0))
        return result * direction
      }

      // На будущее: при расширении SortKey сюда добавляем новую ветку
      // и используем compareNullable для согласованного поведения.
    }
  })

  return copy
}
