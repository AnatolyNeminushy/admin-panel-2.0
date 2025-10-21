/**
 * Карточка получателей рассылки.
 *
 * Что это:
 * UI-блок, который показывает текущую выборку получателей (chat_id + платформа),
 * позволяет вручную добавить chat_id в выборку, а также точечно отметить адресатов
 * для режима отправки «Только выбранные».
 *
 * Как работает:
 * - Вверху — мини-сводка по количеству выбранных получателей.
 * - Блок «Быстрая отправка по chat_id» принимает IDs построчно или через запятую
 *   и добавляет их в текущую выборку (через внешнюю функцию addManualIds).
 * - Таблица со списком отображается и активна только в режиме sendMode === "selected":
 *   при других режимах она визуально приглушена и интерактивность отключена,
 *   чтобы пользователь не путался (но текущие отметки остаются видны).
 */

import Button from "@/components/Button";
import type { Dispatch, SetStateAction, ChangeEvent } from "react";
import type { RecipientSummary, SendMode } from "../types";

interface RecipientsCardProps {
  sendMode: SendMode;
  recipients: RecipientSummary[];
  manualIdsText: string;
  setManualIdsText: Dispatch<SetStateAction<string>>;
  addManualIds: () => void;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  clearSelection: () => void;
}

export default function RecipientsCard({
  sendMode,
  recipients,
  manualIdsText,
  setManualIdsText,
  addManualIds,
  selectedIds,
  toggleOne,
  clearSelection,
}: RecipientsCardProps) {
  const handleManualChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setManualIdsText(event.target.value);
  };

  const isSelectedMode = sendMode === "selected";

  return (
    <section className="bg-[#0f1a3a]/70 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow md:col-span-2">
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-white/60 font-semibold">Получатели</h2>
        <div className="text-body text-white/70">
          Выбрано: <b>{selectedIds.size}</b> из {recipients.length}
        </div>
      </header>

      {/* Ручной ввод chat_id — удобен для тестовой/точечной отправки */}
      <div className="mb-3">
        <div className="text-body text-white/40 mb-1">Быстрая отправка по chat_id</div>

        {/* Связанная метка улучшает доступность для скринридеров */}
        <label htmlFor="manual-ids" className="sr-only">
          Вставьте chat_id построчно или через запятую
        </label>
        <textarea
          id="manual-ids"
          value={manualIdsText}
          onChange={handleManualChange}
          rows={3}
          className="w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/70 px-3 py-2 mb-4 outline-none"
          placeholder={`Вставьте chat_id построчно или через запятую \n123456 \n987654 и др...`}
          aria-label="Вставьте chat_id построчно или через запятую"
        />

        <div className="flex gap-2 mt-2">
          <Button type="button" onClick={addManualIds} variant="accent" size="sm" className="px-4">
            Добавить в выборку
          </Button>
          <Button
            type="button"
            onClick={clearSelection}
            variant="accent"
            size="sm"
            className="px-4"
          >
            Очистить выбранные
          </Button>
        </div>

        <p className="text-body text-slate-400 mt-1">
          После добавления выбери режим <b>«Только выбранные получатели»</b> и жми
          «Проверить/Отправить».
        </p>
      </div>

      {/* Таблица — активна только для режима “Выбранные”, чтобы не путать пользователя */}
      <div
        className={`max-h-72 overflow-auto rounded-lg border border-slate-700 transition-opacity ${
          isSelectedMode ? "" : "opacity-50 pointer-events-none"
        }`}
      >
        <table className="w-full text-body">
          <caption className="sr-only">Список получателей текущей выборки</caption>
          <thead className="bg-[#0b132b] text-slate-300">
            <tr>
              <th scope="col" className="p-2 text-left">
                #
              </th>
              <th scope="col" className="p-2 text-left">
                chat_id
              </th>
              <th scope="col" className="p-2 text-left">
                platform
              </th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 && (
              <tr>
                <td className="p-3 text-slate-400" colSpan={3}>
                  Нажми «Загрузить список», чтобы увидеть получателей по текущим фильтрам.
                </td>
              </tr>
            )}

            {recipients.map((recipient) => {
              const id = String(recipient.chat_id);
              const checked = selectedIds.has(id);
              const key = `${recipient.platform || "platform"}:${id}`;

              return (
                <tr key={key} className="border-t border-slate-700">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(id)}
                      aria-label={`Выбрать получателя ${id}`}
                    />
                  </td>
                  <td className="p-2">{id}</td>
                  <td className="p-2">{recipient.platform}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-body text-slate-400 mt-2">
        В режиме «Выбранные» сообщение уйдёт только тем, кто отмечен чекбоксами.
      </p>
    </section>
  );
}
