/**
 * Компонент "LimitControl" — управляет пагинацией/лимитом видимых элементов.
 *
 * Зачем это нужно:
 * - Пользователь видит, сколько записей уже показано и сколько всего отфильтровано.
 * - Можно быстро поменять "сколько показать" (limit) через инпут с валидацией.
 */

import { useId, type ChangeEvent, type ReactElement } from "react";

interface LimitControlProps {
  /** Текущее значение лимита (сколько элементов показываем) */
  visibleCount: number;
  /** Установить новое значение лимита (родитель управляет состоянием) */
  setVisibleCount: (value: number) => void;
  /** Общее число записей в базе (если известно) — верхняя граница лимита */
  totalCount?: number;
  /** Сколько элементов реально отображено на странице сейчас */
  shownCount: number;
  /** Сколько элементов прошло через фильтр (после поиска/фильтрации) */
  filteredCount: number;
  /** Показать ремарку про общее число записей */
  showTotalNote?: boolean;
}

export default function LimitControl({
  visibleCount,
  setVisibleCount,
  totalCount,
  shownCount,
  filteredCount,
  showTotalNote,
}: LimitControlProps): ReactElement {
  const inputId = useId();
  const hintId = useId();
  const statsId = useId();

  // Локальная функция "клампа" — аккуратно ограничивает значение по нижней/верхней границе
  const clamp = (val: number, min: number, max?: number) => {
    if (Number.isFinite(max as number)) return Math.min(Math.max(val, min), max as number);
    return Math.max(val, min);
  };

  // Выставляем max только если есть totalCount (см. большой комментарий сверху)
  const maxAttr = Number.isFinite(totalCount as number) ? (totalCount as number) : undefined;

  return (
    <div className="flex items-start justify-between mb-3 gap-3">
      {/* Блок статистики: живой регион, чтобы скринридеры озвучивали изменения */}
      <div className="text-body text-gray-700 leading-tight" aria-live="polite" id={statsId}>
        <span>Показано:</span>
        <br />
        <span>
          {shownCount} из {filteredCount}
        </span>
        {showTotalNote && (
          <div className="text-[10px] text-gray-500">
            (в базе всего: {totalCount ?? "—"})
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-body text-gray-500" htmlFor={inputId}>
          Сколько показать:
        </label>

        {/* Подсказка для скринридеров и визуальная справка */}
        <div id={hintId} className="sr-only">
          Введите целое число больше или равно 1
          {typeof totalCount === "number" ? ` и не больше ${totalCount}` : ""}.
        </div>

        <input
          id={inputId}
          aria-describedby={hintId}
          aria-label="Сколько элементов показать"
          title="Введите целое число (минимум 1)"
          type="number"
          // Мобильная клавиатура с цифрами; pattern для некоторых движков
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={maxAttr}
          step={1}
          className="w-24 text-body border rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
          value={visibleCount}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            // Используем parseInt для строгих целых значений
            const raw = e.target.value.trim();
            // Позволяем временно очищать поле — не меняем состояние до валидного числа
            if (raw === "") return;

            const parsed = Number.parseInt(raw, 10);
            if (Number.isNaN(parsed)) return;

            const next = clamp(parsed, 1, totalCount);
            setVisibleCount(next);
          }}
        />
      </div>
    </div>
  );
}
