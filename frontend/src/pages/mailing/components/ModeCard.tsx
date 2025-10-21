/**
 * Карточка режимов доставки (UI-компонент).
 *
 * Что делает:
 * - Позволяет выбрать сценарий отправки (всем/первые N/только выбранные).
 * - Управляет двумя ключевыми действиями: «Отправить/Проверить выборку» и «Загрузить список».
 * - Поддерживает «тестовый прогон» — безопасная проверка выборки без реальной рассылки.
 *
 * Почему так:
 * - Радио-группа оформлена через <fieldset>/<legend> для корректной доступности в screen reader'ах.
 * - Массив конфигурации MODES убирает дублирование разметки и снижает риск расхождений между UI и логикой.
 * - Кнопке отправки выставляем aria-busy в момент отправки, а статусные сообщения — через aria-live,
 *   чтобы пользователь ассистивных технологий получал обратную связь.
 * - aria-selected для <button> не используем (не по спецификации) — вместо этого применяем disabled/aria-busy.
 */

import type { Dispatch, SetStateAction } from "react";
import Button from "@/components/Button";
import type { SendMode } from "../types";

interface ModeCardProps {
  sendMode: SendMode;
  setSendMode: Dispatch<SetStateAction<SendMode>>;
  testMode: boolean;
  setTestMode: Dispatch<SetStateAction<boolean>>;
  canSend: boolean;
  onSend: () => void;
  onLoad: () => void;
  loadingRecipients: boolean;
  isSending: boolean;
}

// Конфигурация режимов: единый источник правды для радио-кнопок и подсказок.
const MODES: Array<{
  value: SendMode;
  label: string;
  description: string;
  aria: string;
}> = [
  {
    value: "all",
    label: "Всем по фильтрам",
    description: "Рассылка всем, кто попадает под текущие фильтры.",
    aria: "Отправить всем по фильтрам",
  },
  {
    value: "limit",
    label: "Первые N по фильтрам",
    description: "Ограниченная рассылка для контроля объёма (первые N).",
    aria: "Отправить первым N по фильтрам",
  },
  {
    value: "selected",
    label: "Только выбранные получатели",
    description: "Точный таргет: только вручную отмеченные получатели.",
    aria: "Отправить только выбранным",
  },
];

export default function ModeCard({
  sendMode,
  setSendMode,
  testMode,
  setTestMode,
  canSend,
  onSend,
  onLoad,
  loadingRecipients,
  isSending,
}: ModeCardProps) {
  return (
    <div className="bg-[#0f1a3a]/70 backdrop-blur-xl border border-white/5 rounded-2xl p-4 space-y-4 shadow">
      {/* Радио-группа режимов с корректной семантикой и доступностью */}
      <fieldset className="space-y-2">
        <legend className="text-body text-white/40 mb-2">Режим</legend>
        <div className="flex flex-col gap-2 text-white/60">
          {MODES.map(({ value, label, description, aria }) => {
            const id = `sendMode-${value}`;
            return (
              <div key={value} className="flex items-start gap-3">
                <input
                  id={id}
                  type="radio"
                  className="accent-[#17E1B1] mt-1"
                  name="sendMode"
                  checked={sendMode === value}
                  onChange={() => setSendMode(value)}
                  aria-label={aria}
                />
                <label htmlFor={id} className="cursor-pointer">
                  <span className="block">{label}</span>
                  <span className="block text-white/40 text-sm">{description}</span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* Тестовый режим: безопасная проверка выборки без реальной отправки */}
      <div className="flex items-start gap-3">
        <input
          id="testMode"
          type="checkbox"
          className="accent-[#17E1B1] mt-1"
          checked={testMode}
          onChange={(event) => setTestMode(event.target.checked)}
          aria-label="Тестовый прогон без отправки"
        />
        <label htmlFor="testMode" className="cursor-pointer text-white/60">
          <span className="block">
            Тестовый прогон (без отправки, только выборка). Режимы «Всем по фильтрам» и «Первые N по
            фильтрам» требуют заполненный текст сообщения.
          </span>
          <span className="block text-white/50 text-sm">
            Подходит для валидации сегмента перед настоящей рассылкой.
          </span>
        </label>
      </div>

      {/* Кнопки действий: состояния завязаны на canSend/isSending и загрузке получателей */}
      <div className="pt-2 flex gap-3 items-center">
        <Button
          type="button"
          onClick={onSend}
          disabled={!canSend || isSending}
          variant="accent"
          size="sm"
          className="px-4"
          aria-busy={isSending || undefined}
        >
          {isSending ? "Работаю…" : testMode ? "Проверить выборку" : "Отправить"}
        </Button>

        <Button
          type="button"
          onClick={onLoad}
          disabled={loadingRecipients}
          loading={loadingRecipients}
          variant="accent"
          size="sm"
          title="Загрузить список по текущим фильтрам (до 500)"
          className="px-4"
          aria-busy={loadingRecipients || undefined}
        >
          Загрузить список
        </Button>

        {/* Живой статус для ассистивных технологий */}
        <span className="text-body text-white/60" aria-live="polite" role="status">
          {loadingRecipients ? "Загружаю получателей…" : null}
        </span>
      </div>
    </div>
  );
}
