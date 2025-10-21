/**
 * Карточка фильтров получателей.
 *
 * Что делает:
 * - Даёт быстрый контроль параметров выборки: платформы, активность, минимальные заказы и лимит (для режима "Первые N").
 * - Все значения — контролируемые (controlled inputs), чтобы состояние было единым источником правды.
*/

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { MailingFilters, PlatformState, SendMode } from "../types";

interface FiltersCardProps {
  platforms: PlatformState;
  setPlatforms: Dispatch<SetStateAction<PlatformState>>;
  filters: MailingFilters;
  setFilters: Dispatch<SetStateAction<MailingFilters>>;
  limit: number;
  setLimit: Dispatch<SetStateAction<number>>;
  sendMode: SendMode;
}

/** Жёстко ограничиваем значения снизу (и отсекаем NaN). */
const clampMin = (value: number, min: number) =>
  Number.isFinite(value) && value >= min ? value : min;

type NumericFilterKey = "onlyActiveDays" | "minOrders";

export default function FiltersCard({
  platforms,
  setPlatforms,
  filters,
  setFilters,
  limit,
  setLimit,
  sendMode,
}: FiltersCardProps) {
  /**
   * Универсальный обработчик для числовых полей фильтров.
   * Используем `valueAsNumber`, чтобы не парсить строки и не ловить локализационные сюрпризы.
   */
  const handleNumericFilter =
    (key: NumericFilterKey) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.currentTarget.valueAsNumber;
      const next = clampMin(raw, 0); // бизнес-правило: не отрицательные значения
      setFilters((prev) => ({ ...prev, [key]: next }));
    };

  /**
   * Обновление платформы получателя — селект влияет на поле `filters.platform`,
   * при этом чекбоксы платформ выше остаются нетронутыми (разные слои фильтрации).
   */
  const handlePlatformSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextPlatform = event.currentTarget.value as MailingFilters["platform"];
    setFilters((prev) => ({ ...prev, platform: nextPlatform }));
  };

  /**
   * Изменение лимита для режима отправки "limit".
   * Минимум = 1, чтобы не получить пустую выборку при активном режиме лимитирования.
   */
  const handleLimitChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.valueAsNumber;
    const next = clampMin(raw, 1);
    setLimit(next);
  };

  /**
   * Единый обработчик чекбоксов платформ — меньше дублирования кода, проще расширять.
   * Пример: onChange={handlePlatformToggle("tg")}
   */
  const handlePlatformToggle =
    (key: keyof PlatformState) => (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.currentTarget.checked;
      setPlatforms((prev) => ({ ...prev, [key]: checked }));
    };

  const limitDisabled = sendMode !== "limit";

  return (
    <div className="bg-[#0f1a3a]/70 backdrop-blur-xl border border-white/5 rounded-2xl p-4 space-y-4 shadow">
      {/* Группа: Платформы — отдельные флаги (tg/vk), чтобы пользователь мог заранее «подготовить» набор. */}
      <fieldset>
        <legend className="text-body text-white/40 mb-2">Платформы</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#17E1B1]"
              checked={platforms.tg}
              onChange={handlePlatformToggle("tg")}
              aria-label="Включить Telegram"
            />
            <span className="text-white/40">Telegram</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#17E1B1]"
              checked={platforms.vk}
              onChange={handlePlatformToggle("vk")}
              aria-label="Включить VK"
            />
            <span className="text-white/40">VK</span>
          </label>
        </div>
      </fieldset>

      {/* Группа: Метрики активности и лояльности — числа приводим к валидному диапазону сразу в обработчике. */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-body">
          <span className="block mb-1 text-white/40">Активны за N дней</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={filters.onlyActiveDays}
            onChange={handleNumericFilter("onlyActiveDays")}
            className="w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/50 px-3 py-2 outline-none"
          />
        </label>

        <label className="text-body">
          <span className="block mb-1 text-white/40">Мин. кол-во заказов</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={filters.minOrders}
            onChange={handleNumericFilter("minOrders")}
            className="w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/50 px-3 py-2 outline-none"
          />
        </label>
      </div>

      {/* Группа: Платформа получателя (селект) + лимит для режима "Первые N". */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-body">
          <span className="block mb-1 text-white/40">Платформа получателя</span>
          <select
            value={filters.platform}
            onChange={handlePlatformSelect}
            className="w-full rounded-xl bg-[#0b132b] text-slate-600 px-3 py-2 outline-none"
          >
            <option value="any">Любая</option>
            <option value="tg">Telegram</option>
            <option value="vk">VK</option>
          </select>
        </label>

        <label className="text-body">
          <span className="block mb-1 text-white/40">Ограничение (N)</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={limit}
            disabled={limitDisabled}
            aria-disabled={limitDisabled}
            onChange={handleLimitChange}
            className={`w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/50 px-3 py-2 outline-none ${
              limitDisabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            aria-describedby={limitDisabled ? "limit-helper" : undefined}
          />
          {limitDisabled && (
            <span id="limit-helper" className="sr-only">
              Поле доступно только в режиме &quot;Первые N&quot;.
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
