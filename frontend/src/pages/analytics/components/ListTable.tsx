import { useMemo } from "react";

/**
 * Таблица со списком гостей.
 *
 * Зачем этот файл:
 * - Отрисовывает адаптивную и доступную таблицу со списком гостей, датами и (опционально) суммами.
 * - Аккуратно форматирует деньги и дату по локали "ru-RU".
 * - Обеспечивает стабильные React-ключи для строк (в т.ч. когда нет id), чтобы избежать "мигания" при обновлениях.
 *
 * Архитектурные заметки (коротко и по делу):
 * - Публичные пропсы строго типизированы, входной список помечен как ReadonlyArray — мы ничего не мутируем.
 * - Все тяжёлые вычисления (formatters, строки таблицы) мемоизированы через useMemo.
 * - Для ключей строк используем явный __key. Если id нет — собираем детерминированный составной ключ + счётчик дублей.
 * - Проверки на «плохие» данные (битая дата / нечисловая сумма) выполняются в утилитах normalizeDate / toNumber.
 * - Компонент — «чистый» (pure): не тянет внешнее состояние, предсказуем для SSR/ISR и не зависит от глобалей.
 */

interface ListItem {
  id?: number | string;
  guest_name?: string;
  total_amount?: number | string | null;
  date?: Date | string | number | null;
  // допускаем произвольные поля — это часто удобно для «сквозной» прокладки данных
  [key: string]: unknown;
}

interface ListTableProps {
  /** Набор элементов для отображения (никогда не мутируется внутри) */
  items?: ReadonlyArray<ListItem>;
  /** Отрисовывать ли колонку с суммой */
  showAmount?: boolean;
}

/** Внутренний тип строки, обогащаем служебным стабильным ключом для React */
type AugmentedItem = ListItem & { __key: string };

/**
 * Безопасно пытаемся привести входное значение к Date.
 * Возвращаем null, если дата невалидна (например, пустая строка или мусор).
 */
function normalizeDate(value: ListItem["date"]): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  // Date парсит и число (timestamp), и ISO-строку.
  const d = new Date(value as unknown as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Нормализуем сумму в number.
 * Любые NaN/Infinity → 0, чтобы рендер был устойчивым и предсказуемым.
 */
function toNumber(value: ListItem["total_amount"]): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Основной компонент таблицы.
 * Важно: явный тип возвращаемого значения для компонентов не обязателен в 2025 (TSX сам выведет типы JSX),
 * поэтому мы не указываем явно JSX.Element, чтобы избежать конфликтов с настройками проекта.
 */
export default function ListTable({ items = [], showAmount = true }: ListTableProps) {
  /**
   * Создаём форматтер денег один раз.
   * Подсказка: maximumFractionDigits: 0 подходит для целевых «целых» сумм. Если нужны копейки — смените на 2.
   */
  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 0,
        currencyDisplay: "symbol",
      }),
    []
  );

  /**
   * Форматтер даты/времени.
   * Пояснение: "ru-RU" — 24-часовой формат; month/day в "2-digit" сохраняют компактный вид в таблице.
   */
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  /**
   * Подготовка строк для рендера.
   * Нюанс: если у элемента нет id, генерируем составной ключ по полям, чтобы React стабильно переиспользовал DOM-узлы.
   * Неочевидный момент (важно): при коллизиях ключей добавляем суффикс dup#N — это защищает от случайных дублей.
   */
  const rows: AugmentedItem[] = useMemo(() => {
    const seen = new Map<string, number>();

    return items.map<AugmentedItem>((item) => {
      if (item.id != null) {
        // если id приходит из БД/API — используем его как приоритетный источник истины
        return { ...item, __key: `row-${String(item.id)}` };
      }

      const d = normalizeDate(item.date);
      const baseKey = [
        item.guest_name ?? "",
        d ? d.toISOString() : "",
        String(toNumber(item.total_amount)),
      ].join("|");

      const current = seen.get(baseKey) ?? 0;
      seen.set(baseKey, current + 1);

      const uniqueKey = current === 0 ? baseKey : `${baseKey}|dup#${current}`;
      return { ...item, __key: uniqueKey };
    });
  }, [items]);

  // Кол-во колонок для пустого состояния — зависит от showAmount
  const emptyColSpan = showAmount ? 3 : 2;

  const captionText = showAmount ? "Список гостей с суммами и датами" : "Список гостей с датами";

  // Классы вынесены в константы — легче обслуживать и менять со временем, меньше шума в JSX
  const dateHeaderClass =
    "px-4 py-2 text-right font-medium min-w-0 sm:pr-12 lg:pr-20 whitespace-nowrap";
  const dateCellClass =
    "px-2 sm:px-4 py-2 text-right whitespace-normal sm:whitespace-nowrap min-w-0 sm:pr-8";
  const guestColumnClass = showAmount ? "w-[45%] sm:w-auto" : "w-[55%] sm:w-auto";
  const amountColumnClass = "w-[30%] sm:w-auto";
  const dateColumnClass = showAmount ? "w-[25%] sm:w-auto" : "w-[45%] sm:w-auto";
  const guestHeaderClass = `px-4 py-2 text-left font-medium whitespace-normal min-w-0 ${guestColumnClass}`;
  const amountHeaderClass = `px-2 sm:px-4 py-2 text-right sm:pr-6 font-medium whitespace-normal min-w-0 ${amountColumnClass}`;
  const dateHeaderWithWidth = `${dateHeaderClass} ${dateColumnClass}`;
  const guestCellClass = `px-4 py-2 whitespace-normal break-words min-w-0 ${guestColumnClass}`;
  const amountCellClass = `px-2 sm:px-4 py-2 text-right tabular-nums whitespace-normal sm:whitespace-nowrap break-words min-w-0 ${amountColumnClass}`;
  const dateCellWithWidth = `${dateCellClass} ${dateColumnClass}`;

  return (
    <div className="overflow-auto max-h-[360px] md:max-h-[360px] min-w-0">
      <table className="w-full min-w-0 table-fixed text-body">
        {/* Делаем таблицу доступной для скринридеров */}
        <caption className="sr-only">{captionText}</caption>

        {/* Важно для UX: заголовок «липкий», чтобы не терять контекст при прокрутке */}
        <thead className="text-white/50 sticky top-0 z-10 bg-[#2C3556]">
          <tr>
            <th scope="col" className={guestHeaderClass}>
              Гость
            </th>
            {showAmount ? (
              <th scope="col" className={amountHeaderClass}>
                Сумма
              </th>
            ) : null}
            <th scope="col" className={dateHeaderWithWidth}>
              Дата
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            // Пустое состояние — явно и дружественно к пользователю
            <tr>
              <td colSpan={emptyColSpan} className="py-[15%] text-center text-white/30">
                Данные не найдены
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const dateObj = normalizeDate(row.date);
              const amount = toNumber(row.total_amount);

              // Примечание: Intl.NumberFormat вставляет NBSP — заменим на обычные пробелы,
              // чтобы классы whitespace-* в Tailwind работали предсказуемо.
              const formattedAmount = moneyFormatter
                .format(amount)
                .replace(/\u00A0/g, " ")
                .replace(/\u202F/g, " ");

              return (
                <tr
                  key={row.__key}
                  className="text-body text-white/40 even:bg-white/10 odd:bg-white/5"
                >
                  <td className={guestCellClass}>{row.guest_name || "—"}</td>

                  {showAmount ? <td className={amountCellClass}>{formattedAmount}</td> : null}

                  <td className={dateCellWithWidth}>
                    {dateObj ? dateTimeFormatter.format(dateObj) : "—"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
