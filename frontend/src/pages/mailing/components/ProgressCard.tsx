/**
 * Карточка прогресса рассылки.
 *
 * Что это:
 * — UI-компонент, который показывает агрегированные счётчики (всего / отправлено / ошибки / режим)
 *   и подробный лог по каждому получателю в таблице.
 *
 * Зачем так:
 * — Компонент «чистый»: получает только { progress } и сам ничего не загружает.
 * — Значения вычисляются через useMemo, чтобы исключить лишние перерисовки при частых обновлениях прогресса.
 * — Нормализуем данные (items) на входе: защищаемся от null/undefined и «кривых» структур.
 * — Добавлена доступность (a11y): aria-live для динамических обновлений и caption/scope для таблицы.
 */

import { useMemo } from "react";
import type { BroadcastProgress } from "../types";

// Минимально необходимая форма одного элемента прогресса.
// Если в доменной модели появятся поля (например, 'errorCode' или 'timestamp'),
// расширьте тип здесь и добавьте колонки в таблицу ниже.
type ProgressItem = {
  chat_id?: string | number | null;
  platform?: string | null;
  ok?: boolean | null;
  detail?: string | null;
};

interface ProgressCardProps {
  progress: BroadcastProgress | null;
}

export default function ProgressCard({ progress }: ProgressCardProps) {
  // Если прогресса нет — ничего не рендерим (контракт «пустое состояние»).
  if (!progress) return null;

  /**
   * Нормализуем массив items, чтобы ниже не плодить проверок.
   * Плюс здесь же предвычисляем derived-значения (modeLabel, totals).
   */
  const { items, totals, modeLabel, errorText } = useMemo(() => {
    const raw = Array.isArray((progress as any).items) ? ((progress as any).items as ProgressItem[]) : [];

    const safeItems: ProgressItem[] = raw.map((r) => ({
      chat_id: r?.chat_id ?? null,
      platform: r?.platform ?? null,
      ok: typeof r?.ok === "boolean" ? r.ok : null,
      detail: r?.detail ?? null,
    }));

    // Счётчики: берём из progress, если заданы, иначе считаем по данным.
    const computedSent = safeItems.reduce((acc, r) => (r.ok ? acc + 1 : acc), 0);
    const computedFailed = safeItems.reduce((acc, r) => (r.ok === false ? acc + 1 : acc), 0);

    const total =
      typeof (progress as any).total === "number"
        ? (progress as any).total
        : safeItems.length;

    const sent =
      typeof (progress as any).sent === "number"
        ? (progress as any).sent
        : computedSent;

    const failed =
      typeof (progress as any).failed === "number"
        ? (progress as any).failed
        : computedFailed;

    const modeLabel =
      (progress as any).mode ??
      ((progress as any).testMode ? "тест" : "боевой");

    const errorText = (progress as any).error ? String((progress as any).error) : "";

    return {
      items: safeItems,
      totals: { total, sent, failed },
      modeLabel: String(modeLabel),
      errorText,
    };
  }, [progress]);

  // Небольшой helper для форматирования целых чисел — дружелюбнее к локали.
  const nf = useMemo(() => new Intl.NumberFormat("ru-RU"), []);

  return (
    <section
      className="rounded-2xl bg-[#0f1a3a] p-4 shadow"
      aria-live="polite" // Сообщаем скринридерам о возможных обновлениях содержимого
    >
      <h3 className="mb-2 font-semibold text-white">Результат</h3>

      {errorText && (
        <div
          className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300"
          role="alert"
        >
          Ошибка: {errorText}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-slate-300 md:grid-cols-4">
        <div>
          Всего получателей: <b>{nf.format(totals.total ?? 0)}</b>
        </div>
        <div>
          Отправлено: <b>{nf.format(totals.sent ?? 0)}</b>
        </div>
        <div>
          Ошибки: <b>{nf.format(totals.failed ?? 0)}</b>
        </div>
        <div>
          Режим: <b>{modeLabel}</b>
        </div>
      </div>

      {/* Подробные записи — показываем только если есть что показать */}
      {items.length > 0 ? (
        <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm text-slate-200">
            <caption className="sr-only">
              Подробные статусы доставки по каждому получателю
            </caption>
            <thead className="bg-[#0b132b] text-slate-300">
              <tr>
                <th scope="col" className="p-2 text-left">
                  chat_id
                </th>
                <th scope="col" className="p-2 text-left">
                  platform
                </th>
                <th scope="col" className="p-2 text-left">
                  status
                </th>
                <th scope="col" className="p-2 text-left">
                  detail
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((record, idx) => {
                // Стабильный ключ: платформа + chat_id + detail (если есть).
                // Fallback на индекс безопасен здесь: список статичен между изменениями одной ревизии.
                const platform = record.platform ?? "unknown";
                const id = record.chat_id ?? "n/a";
                const detail = record.detail ?? "";
                const key = `${platform}:${id}:${detail}` || `row-${idx}`;

                return (
                  <tr key={key} className="border-t border-slate-700">
                    <td className="p-2 font-mono">{String(record.chat_id ?? "—")}</td>
                    <td className="p-2">{record.platform ?? "—"}</td>
                    <td className="p-2">{record.ok === true ? "ok" : record.ok === false ? "fail" : "—"}</td>
                    <td className="p-2">{record.detail && record.detail.trim() ? record.detail : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // Пустое состояние — подсказка пользователю, что делать дальше.
        <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 text-slate-300">
          Пока нет отдельных записей. Как только начнётся рассылка или поступят логи от провайдера, здесь появятся строки с деталями.
        </div>
      )}
    </section>
  );
}
