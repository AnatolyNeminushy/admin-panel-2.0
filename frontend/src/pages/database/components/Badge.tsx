import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

/**
 * Бейдж (Badge) — компактный визуальный маркер статуса/метки.
 *
 * Зачем это нужно:
 * - Быстро подсветить состояние (например: "Новый", "Оплачен", "Ошибка").
 * - Сгладить различия в стиле по всему приложению за счёт единой типографики и отступов.
 *
 * Что внутри:
 * - Семантически это <span> с display: inline-flex — хорошо встраивается в текстовые блоки и таблицы.
 * - Управляемая внешность через props: `variant`, `tone`, `size`, `round`, плюс произвольные HTML-атрибуты.
 * - Объединение служебных классов (Tailwind) через утилиту `cn` — удобно, когда нужно добавить свои классы.
 */

type BadgeVariant = "soft" | "solid";
type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";
type BadgeSize = "sm" | "md";
type BadgeRound = "full" | "md";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Содержимое бейджа: текст, иконки, любые инлайн-элементы. */
  children: ReactNode;
  /** Вариант заливки: мягкий фон (`soft`) или плотный контрастный (`solid`). */
  variant?: BadgeVariant;
  /** Оттенок (семантическая палитра), а не конкретный цвет — проще менять тему. */
  tone?: BadgeTone;
  /** Размер шрифта и отступов. */
  size?: BadgeSize;
  /** Скругление: `full` (капсула) или умеренное `md`. */
  round?: BadgeRound;
  /** Дополнительные классы Tailwind/CSS для локальной подстройки. */
  className?: string;
}

/** Простейшая утилита объединения классов (без внешних зависимостей). */
function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Карта размеров: инлайн-метрики для визуальной согласованности. */
const sizeMap: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

/** Скругление. */
const roundMap: Record<BadgeRound, string> = {
  full: "rounded-full",
  md: "rounded-md",
};

/**
 * Цветовые токены под разные `tone` и `variant`.
 * Примечание: классы ориентированы на Tailwind. При желании можно
 * заменить на CSS-переменные темы (например, через design tokens).
 */
const solidMap: Record<BadgeTone, string> = {
  neutral: "bg-slate-700 text-slate-100",
  success: "bg-emerald-600 text-emerald-50",
  warning: "bg-amber-500 text-amber-950",
  danger: "bg-rose-600 text-rose-50",
  info: "bg-sky-600 text-sky-50",
};

const softMap: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-800",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-800",
  info: "bg-sky-100 text-sky-800",
};

/**
 * Компонент Badge.
 * Безопасно прокидывает ref и все валидные HTML-атрибуты <span>.
 */
const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    children,
    variant = "solid",
    tone = "neutral",
    size = "sm",
    round = "full",
    className,
    ...rest
  },
  ref
) {
  // Базовые утилитарные классы: компактная типографика, ровные отступы, переносы.
  const base =
    "inline-flex items-center gap-1 font-medium leading-none whitespace-normal break-words select-none";

  const appearance =
    variant === "solid" ? solidMap[tone] : softMap[tone];

  return (
    <span
      ref={ref}
      className={cn(base, sizeMap[size], roundMap[round], appearance, className)}
      {...rest}
    >
      {children}
    </span>
  );
});

export default Badge;

