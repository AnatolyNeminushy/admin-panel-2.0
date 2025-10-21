/**
 * Мобильное представление таблицы.
 *
 * Зачем это нужно:
 * - На узких экранах привычная таблица «ломается». Мы превращаем строки в компактные карточки,
 *   сохраняя заголовки колонок и структуру данных — пользователю не нужно заново «учиться» интерфейсу.
 * - В каждой карточке сразу доступны действия (редактирование/удаление) — это снижает количество кликов.
 *
 * Ключевые идеи реализации:
 * - Типобезопасные колонки: ключи берутся из типа строки, рендерер позволяет форматировать значения (бейджи, даты).
 * - Стабильные ключи карточек: используем id/chat_id, а при их отсутствии — индекс (на пагинируемых списках это безопасно).
 * - Плейсхолдеры для пустых значений: визуально выравнивают контент (поддержка «пустых» строк).
 * - Семантическая разметка: <article>/<header> помогают скринридерам и улучшают доступность.
 * - Простая разметка и атомарные классы (Tailwind): верстка предсказуемая, единообразная и легко поддерживаемая.
 */

import type { ReactNode } from "react";

type RowData = Record<string, unknown> & {
  id?: string | number;
  chat_id?: string | number;
};

type MobileColumn<Row extends RowData = RowData> = {
  /** Ключ поля в строке данных. */
  key: keyof Row & string;
  /** Человеко-читаемый заголовок поля. */
  title: string;
  /**
   * Кастомный рендерер значения.
   * Используйте для форматирования дат, подсветки статусов, бейджей и т.п.
   * Возвращайте готовый React-узел.
   */
  render?: (value: Row[keyof Row], row: Row) => ReactNode;
};

type MobileCardsProps<Row extends RowData = RowData> = {
  rows: Row[];
  columns: ReadonlyArray<MobileColumn<Row>>;
  /** Идентификатор текущей вкладки/раздела — участвует в генерации ключей. */
  tab: string;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
  /** Номер страницы (1-based). */
  page: number;
  /** Размер страницы (количество элементов на страницу). */
  pageSize: number;
  /** Флаг загрузки — влияет на отображение пустого состояния. */
  loading: boolean;
};

const FALLBACK_PLACEHOLDER = "—";

/** Мягкая проверка «пустоты» значения: null/undefined/пустая строка. */
function isEmptyValue(value: unknown): boolean {
  return (
    value == null || // null | undefined
    (typeof value === "string" && value.trim().length === 0)
  );
}

export default function MobileCards<Row extends RowData = RowData>({
  rows,
  columns,
  tab,
  onEdit,
  onDelete,
  page,
  pageSize,
  loading,
}: MobileCardsProps<Row>) {
  // Пустое состояние: показываем только когда не идет загрузка — так избегаем «мигания» контента.
  if (rows.length === 0 && !loading) {
    return (
      <div
        className="p-[20%] text-center text-white/30 bg-white/10 backdrop-blur-xl rounded-2xl"
        role="status"
        aria-live="polite"
      >
        Пусто
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-busy={loading || undefined}>
      {rows.map((row, index) => {
        /**
         * Стабильный ключ карточки:
         * - сначала пробуем id/chat_id;
         * - если их нет (например, черновые строки), используем индекс + номер страницы.
         * Для пагинации это стабильно (на странице индексы фиксированы).
         */
        const stableKey = (row.id ?? row.chat_id ?? index) as string | number;
        const itemNumber = (page - 1) * pageSize + index + 1;

        return (
          <article
            key={`${tab}-m-${stableKey}`}
            className="rounded-xl border border-slate-700 bg-[#0b1533] p-3"
            aria-label={`Запись №${itemNumber}`}
          >
            <header className="flex items-center justify-between mb-2">
              <div className="text-body text-slate-400">#{itemNumber}</div>

              {/* CTA-кнопки: короткие подписи + aria-label для доступности. */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white text-body"
                  aria-label="Изменить запись"
                  title="Изменить"
                >
                  Изм.
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(row)}
                  className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-body"
                  aria-label="Удалить запись"
                  title="Удалить"
                >
                  Удал.
                </button>
              </div>
            </header>

            {/* Сетка повторяет семантику таблицы: слева заголовок поля, справа — значение. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {columns.map((column) => {
                const rawValue = row[column.key];
                const content = column.render
                  ? column.render(rawValue, row)
                  : isEmptyValue(rawValue)
                  ? FALLBACK_PLACEHOLDER
                  : (rawValue as ReactNode);

                return (
                  <div key={column.key} className="text-body">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      {column.title}
                    </div>
                    <div className="mt-0.5">{content}</div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
