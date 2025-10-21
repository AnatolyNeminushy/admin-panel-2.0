/**
 * Компонент «Info»
 *
 * Что это:
 * — Небольшой UI-блок для отображения пары «метка → значение» в профиле.
 *
 * Зачем так:
 * — Значение может быть как простым текстом/числом, так и готовым React-узлом (ссылки, тэги, иконки).
 * — Пустые значения показываем как длинное тире «—», чтобы верстка не «скакала» и интерфейс выглядел предсказуемо.
 * — Добавлена легкая нормализация строк: пробелы и пустые строки считаем пустым значением.
 */

import { memo, type ReactNode } from "react";

type InfoProps = {
  /** Подпись поля (левая/верхняя часть). Старайтесь передавать уже локализованное значение. */
  label: string;
  /** Само значение: текст, число или произвольный React-контент. */
  value?: ReactNode;
};

/** Приводим значение к отображаемому виду и аккуратно обрабатываем «пустоту». */
function renderValue(value: ReactNode): ReactNode {
  // null/undefined → «—»
  if (value == null) return "—";

  // Строка из одних пробелов → «—»
  if (typeof value === "string" && value.trim().length === 0) return "—";

  return value;
}

export const Info = memo(function Info({ label, value = "—" }: InfoProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-xl border border-white/10 p-3"
    >
      {/* Метка: делаем её «второстепенной», чтобы визуальный фокус был на значении */}
      <div className="text-body uppercase text-white/30">{label}</div>

      {/* Значение: если пусто — покажем «—». Поддерживает любой React-контент. */}
      <div className="font-medium text-white/50">{renderValue(value)}</div>
    </div>
  );
});

Info.displayName = "Info";
