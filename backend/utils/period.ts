
/**
 * Работа с датами для аналитических отчётов: вычисление безопасного диапазона.
 */
import type { ParsedQs } from 'qs';

/**
 * Ограничивает значение в заданных пределах.
 */
const clampDays = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

/**
 * Возвращает сегодняшнюю дату в формате YYYY-MM-DD (UTC).
 */
const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * Смещает ISO-дате на delta дней вперёд/назад. Если iso некорректна — берём сегодняшнюю дату.
 */
const addDaysISO = (iso: string, delta: number): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayISO();
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

type PeriodQuery = ParsedQs & {
  from?: string;
  to?: string;
  all?: string;
};

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Вычисляет безопасный диапазон дат на основании query-параметров.
 * Позволяет ограничивать длину диапазона (по умолчанию 14 дней, максимум 366),
 * но при all=1 возвращает «всё доступное» без ограничений.
 */
export const getRange = (req: { query: PeriodQuery }): DateRange => {
  let { from, to, all } = req.query;
  const today = todayISO();
  if (!to) to = today;

  if (all === '1') {
    if (!from) from = '1970-01-01';
    return { from, to };
  }

  if (!from) from = addDaysISO(to, -13);

  const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  const safe = clampDays(diffDays, 1, 366);

  if (diffDays !== safe) {
    from = addDaysISO(to, -(safe - 1));
  }

  return { from, to };
};
