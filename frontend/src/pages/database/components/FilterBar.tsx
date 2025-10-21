/**
 * Панель фильтрации заказов и бронирований.
 *
 * Зачем нужна:
 * - Быстро сузить выборку по ключевым параметрам без ручного SQL и сложных форм.
 * - Давать аналитикам и операторам предсказуемый, контролируемый интерфейс фильтров.
 *
 * Что внутри:
 * - Контролируемые поля (всё хранится в едином объекте `filters`).
 * - Бережная работа с числами: поддержка пустых значений и защита от NaN.
 * - Адаптивная сетка без медиа-запросов в коде — всё на утилитах Tailwind.
 * - Универсальный обработчик изменения значений, чтобы не плодить однотипные коллбэки.
 *
 * Подсказка для читателя:
 * - Для добавления нового фильтра достаточно расширить `DatabaseFilterState`
 *   и использовать `handleFilterChange("<имя_ключа>")` на нужном инпуте.
 * - Если поле числовое — добавьте ключ в `NUMERIC_KEYS`, и конвертация сделается автоматически.
 */

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import Button from "@/components/Button";
import DateField from "@/components/DateField";

// Разрешённые вкладки. Тип расширяем "вперёд" (перечень может быть шире, чем наш UI).
type PermissiveTab = "orders" | "reservations" | (string & {});

// Состояние фильтров. `Partial` — позволяeт не хранить лишние undefined-ключи.
export type DatabaseFilterState = Partial<{
  platform: string;
  order_type: string;
  date_from: string;
  date_to: string;
  min_total: number | "";
  max_total: number | "";
  min_guests: number | "";
  max_guests: number | "";
}>;

// Мини-эвент для внешнего компонента даты: имитируем target.value как у нативных полей.
type SyntheticDateEvent = { target: { value: string | undefined } };

type FilterBarProps = {
  tab: PermissiveTab;
  filters: DatabaseFilterState;
  setFilters: Dispatch<SetStateAction<DatabaseFilterState>>;
  onApply: () => void;
  onReset: () => void;
  mobileOpen?: boolean;
};

// Чётко описываем, какие ключи считаются числовыми — это точка расширения.
type NumericFilterKey = "min_total" | "max_total" | "min_guests" | "max_guests";

// Белый список числовых полей. Через `satisfies` проверяем соответствие типу в момент сборки.
const NUMERIC_KEYS = new Set<NumericFilterKey>([
  "min_total",
  "max_total",
  "min_guests",
  "max_guests",
]) satisfies ReadonlySet<NumericFilterKey>;

// Единый класс для инпутов: удерживаем визуал единообразным и меняем стиль в одном месте.
const INPUT_CLASS =
  "rounded-xl bg-[#09102a] px-3 py-2 placeholder-white/30 text-white/50 outline-none";

// Мини-конвертер для числовых инпутов: поддерживаем controlled-поведение и пустые строки.
const normalizeNumeric = (value: string | undefined) => {
  if (value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isNaN(parsed) ? "" : parsed;
};

export default function FilterBar({
  tab,
  filters,
  setFilters,
  onApply,
  onReset,
  mobileOpen = false,
}: FilterBarProps) {
  // Компонент активен только в контексте поддерживаемых вкладок.
  if (tab !== "orders" && tab !== "reservations") return null;

  // Mobile-first приём: не размонтируем блок, чтобы не терять локальный state контролов.
  const mobileHiddenClass = mobileOpen ? "" : "hidden md:block";

  // Универсальный обработчик: нормализуем значения и обновляем `filters` точечно.
  const handleFilterChange =
    <K extends keyof DatabaseFilterState>(key: K) =>
    (
      event:
        | ChangeEvent<HTMLInputElement | HTMLSelectElement>
        | SyntheticDateEvent
    ) => {
      const rawValue = event.target.value;
      const nextValue = (NUMERIC_KEYS.has(key as NumericFilterKey)
        ? normalizeNumeric(typeof rawValue === "string" ? rawValue : undefined)
        : rawValue ?? undefined) as DatabaseFilterState[K];

      setFilters((prev) => ({
        ...prev,
        [key]: nextValue,
      }));
    };

  const isOrdersTab = tab === "orders";
  const isReservationsTab = tab === "reservations";

  return (
    <div
      className={`relative z-20 border border-white/5 rounded-xl bg-[#0b1533]/70 backdrop-blur-xl p-3 ${mobileHiddenClass}`}
    >
      {/* Сетка без лишних обёрток: плотность увеличивается к десктопу */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {isOrdersTab && (
          <>
            {/* Платформа: telegram / vk / ... */}
            <label className="flex flex-col gap-1 text-body">
              <span className="text-body text-white/20">Платформа</span>
              <select
                className={INPUT_CLASS}
                value={filters.platform ?? ""}
                onChange={handleFilterChange("platform")}
              >
                <option value="">— любая —</option>
                <option value="telegram">telegram</option>
                <option value="vk">vk</option>
              </select>
            </label>

            {/* Тип заказа: свободный текст, чтобы не ограничивать бизнес-термины */}
            <label className="flex flex-col gap-1 text-body">
              <span className="text-body text-white/20">Тип заказа</span>
              <input
                className={INPUT_CLASS}
                value={filters.order_type ?? ""}
                onChange={handleFilterChange("order_type")}
                placeholder="доставка / самовывоз…"
                autoComplete="off"
                inputMode="text"
              />
            </label>
          </>
        )}

        {/* Датапикер хранит ISO-строки — удобно для сериализации в API */}
        <DateField
          label="С даты"
          value={filters.date_from ?? ""}
          onChange={handleFilterChange("date_from")}
          max={filters.date_to || undefined}
          className="w-[220px]"
        />

        <DateField
          label="По дату"
          value={filters.date_to ?? ""}
          onChange={handleFilterChange("date_to")}
          min={filters.date_from || undefined}
          className="w-[220px]"
        />

        {isOrdersTab && (
          <>
            {/* Суммы заказа: поддерживаем пустые значения и нижнюю границу */}
            <label className="flex flex-col gap-1 text-body">
              <span className="text-body text-white/20">Мин. сумма</span>
              <input
                type="number"
                className={INPUT_CLASS}
                value={filters.min_total ?? ""}
                onChange={handleFilterChange("min_total")}
                placeholder="от"
                min={0}
                inputMode="numeric"
              />
            </label>

            <label className="flex flex-col gap-1 text-body">
              <span className="text-body text-white/20">Макс. сумма</span>
              <input
                type="number"
                className={INPUT_CLASS}
                value={filters.max_total ?? ""}
                onChange={handleFilterChange("max_total")}
                placeholder="до"
                min={0}
                inputMode="numeric"
              />
            </label>
          </>
        )}

        {isReservationsTab && (
          <>
            {/* Количество гостей: аналогичная логика числовых полей */}
            <label className="flex flex-col gap-1 text-body">
              <span className="text-body text-white/20">Мин. гостей</span>
              <input
                type="number"
                className={INPUT_CLASS}
                value={filters.min_guests ?? ""}
                onChange={handleFilterChange("min_guests")}
                placeholder="от"
                min={0}
                inputMode="numeric"
              />
            </label>

            <label className="flex flex-col gap-1 text-body">
              <span className="text-body text-white/20">Макс. гостей</span>
              <input
                type="number"
                className={INPUT_CLASS}
                value={filters.max_guests ?? ""}
                onChange={handleFilterChange("max_guests")}
                placeholder="до"
                min={0}
                inputMode="numeric"
              />
            </label>
          </>
        )}
      </div>

      {/* CTA-блок: две кнопки рядом — сохраняем фокус и привычный паттерн */}
      <div className="mt-3 md:mt-4 flex flex-col md:flex-row md:justify-end gap-2">
        <Button type="button" onClick={onReset} variant="accent" size="sm">
          Сбросить фильтры
        </Button>
        <Button type="button" onClick={onApply} variant="accent" size="sm">
          Применить
        </Button>
      </div>
    </div>
  );
}
