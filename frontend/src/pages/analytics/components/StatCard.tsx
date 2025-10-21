import { type ReactNode, type CSSProperties } from "react";

/**
 * Карточка метрики (StatCard).
 *
 * Зачем:
 * - Компактно показывает числовой/текстовый показатель с подписью и пиктограммой.
 * - Использует семантическую разметку и понятные классы, чтобы легко переиспользовать в дашбордах.
 *
 * Что внутри:
 * - label — краткий заголовок метрики (подпись).
 * - value — само значение (может быть числом, форматированной строкой или JSX).
 * - icon — опциональная иконка/лого; помечена как декоративная (aria-hidden), чтобы не «засорять» скринридер.
 */

/** Публичные пропсы компонента */
interface StatCardProps {
  /** Декоративная иконка/лого справа (SVG или изображение). Опционально. */
  icon?: ReactNode;
  /** Короткая подпись метрики (заголовок). */
  label: string;
  /** Отрисовываемое значение метрики (число/строка/JSX). */
  value: ReactNode;
}

/** Базовое значение размера иконки; можно переопределить через inline-style при необходимости. */
const ICON_SIZE = "clamp(40px, 6vw, 52px)" as const;
const ICON_GAP = 20 as const;

/** Тип для inline-стиля с поддержкой пользовательских CSS-переменных */
type IconCircleStyle = CSSProperties &
  Record<"--icon-sz", string> &
  Record<"--icon-gap", string>;

export default function StatCard({ icon = null, label, value }: StatCardProps) {
  // Переменная для управления адаптивным размером иконки без any/ts-ignore
  const circleStyle: IconCircleStyle = {
    ["--icon-sz"]: ICON_SIZE,
    ["--icon-gap"]: `${ICON_GAP}px`,
  };

  return (
    <div className="metric-card flex justify-between gap-4" role="group">
      {/* Текстовая часть: подпись и значение.
          min-w-0 + truncate защищают от переполнения длинными строками. */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="pt-2 text-h4 text-white/80 truncate">{label}</div>
        <div className="pt-4 font-medium text-h1 text-white truncate">{value}</div>
      </div>

      {/* Декоративный круг с иконкой.
         aria-hidden — чтобы скринридеры не читали пиктограмму как смысловой контент. */}
      <span
        style={circleStyle}
        className="
          grid h-[var(--icon-sz)] w-[var(--icon-sz)] place-items-center
          flex-none shrink-0 rounded-full bg-gray-200/10
          [&>div]:h-[calc(var(--icon-sz)-var(--icon-gap))] [&>div]:w-[calc(var(--icon-sz)-var(--icon-gap))]
          [&>div]:grid [&>div]:place-items-center
          [&>div>svg]:max-h-full [&>div>svg]:max-w-full [&>div>svg]:object-contain
          [&>div>img]:max-h-full [&>div>img]:max-w-full [&>div>img]:object-contain
        "
        aria-hidden="true"
      >
        {/* Прозрачность вынесена во внутренний слой, чтобы не влиять на фон круга */}
        <div className="opacity-40">{icon}</div>
      </span>
    </div>
  );
}
