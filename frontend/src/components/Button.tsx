import {
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Компоненты интерфейса: универсальная Button и SegmentedToggle (табы) + RangePresets.
 *
 * Назначение:
 * - Button — единая точка для стилизованных кнопок с вариантами (variant), размерами (size),
 *   состояниями (disabled/loading) и поддержкой «группированных» кнопок.
 * - SegmentedToggle — таб-переключатель на основе Button с «подсветкой» активной вкладки (thumb),
 *   адаптивной шириной и анимированным перемещением thumb.
 * - RangePresets — ряд кнопок для выбора преднастроенных фильтров/диапазонов.
 */

/* ======================== Button ======================== */

type ButtonVariant = "primary" | "secondary" | "ghost" | "tab" | "accent" | "pill";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  loading?: boolean;
  variant?: ButtonVariant;
  grouped?: boolean;
  size?: ButtonSize;
  className?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    type = "button",
    disabled = false,
    loading = false,
    variant = "primary",
    grouped = false,
    size = "md",
    className = "",
    ...props
  },
  ref
): ReactElement {
  const sizes: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-body",
    md: "px-4 py-2 text-body",
    lg: "px-5 py-2.5 text-body",
  };

  // «Широкие» кнопки по умолчанию (кроме специальных вариантов, которые обычно плавают по содержимому)
  const isFullWidth = !grouped && !["tab", "accent", "pill"].includes(variant);
  const width = isFullWidth ? "w-full" : "w-auto";

  const base = [
    "font-semibold rounded-md transition-colors duration-200 motion-reduce:transition-none",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    width,
    sizes[size] ?? sizes.md,
    "outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
    "enabled:active:brightness-90",
  ].join(" ");

  const variants: Record<ButtonVariant, string> = {
    primary: "bg-[#17E1B1] text-[#13214C] enabled:hover:bg-[#13214C] enabled:hover:text-white",
    secondary: "bg-[#13214C] text-white enabled:hover:bg-[#17E1B1] enabled:hover:text-[#13214C]",
    ghost: "bg-transparent text-slate-200 enabled:hover:bg-white/10 border border-white/10",
    // ВАЖНО: для вкладок цвет текста берётся из aria-selected (см. SegmentedToggle),
    // фон и «подсветку» перемещает thumb, поэтому тут — только базовая типографика.
    tab: "aria-selected:text-black/40",
    accent: "bg-white/20 enabled:hover:bg-white/30 text-white/50 backdrop-blur-xl -mt-4",
    pill: "bg-[#17E1B1]/50",
  };

  // Стили для «группированных» кнопок (button group) — без промежутков и с общими границами
  const groupedBase =
    "rounded-none first:rounded-l-xl last:rounded-r-xl border first:ml-0 -ml-px focus:z-10";

  const groupedVariant: Record<Exclude<ButtonVariant, "tab">, string> = {
    primary:
      "bg-[#0f1b3d] text-white enabled:hover:bg-[#13214C] border-[#1a2b66] aria-selected:bg-[#17E1B1] aria-selected:text-[#13214C] aria-selected:border-[#17E1B1]",
    secondary:
      "bg-[#1fe7b7]/10 text-[#17E1B1] enabled:hover:bg-[#1fe7b7]/20 border-[#1fe7b7]/40 aria-selected:bg-[#17E1B1] aria-selected:text-[#13214C] aria-selected:border-[#17E1B1]",
    ghost:
      "bg-transparent text-slate-200 enabled:hover:bg-white/10 border-white/15 aria-selected:bg-white/15 aria-selected:text-white",
    accent: "bg-white/20 enabled:hover:bg-white/30 text-white/50 backdrop-blur-xl -mt-4",
    pill: "bg-[#17E1B1]/50",
  };

  const appearance =
    variant === "tab"
      ? variants.tab
      : grouped
      ? `${groupedBase} ${
          groupedVariant[variant as Exclude<ButtonVariant, "tab">] ?? groupedVariant.primary
        }`
      : variants[variant] ?? variants.primary;

  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`${base} ${appearance} ${className}`.trim()}
      {...props}
    >
      {loading ? "Загрузка…" : children}
    </button>
  );
});

export default Button;

/* ======================== SegmentedToggle ======================== */

export interface SegmentedItem {
  value: string;
  label: ReactNode;
}

interface SegmentedToggleProps {
  items: SegmentedItem[];
  activeValue: string;
  onChange: (value: string) => void;
  size?: ButtonSize;
  className?: string;
  listClassName?: string;
  tabClassName?: string;
  thumbClassName?: string;
}

/**
 * ВАЖНО: createFallbackThumbStyle даёт корректный initial layout ещё до измерений DOM.
 * Это устраняет «дёрганье» при первом рендере и полезно при серверном рендеринге.
 */
const createFallbackThumbStyle = (itemCount: number, index: number): CSSProperties => {
  const safeCount = Math.max(1, itemCount);
  const safeIndex = Math.min(Math.max(index, 0), safeCount - 1);

  return {
    width: `calc(100% / ${safeCount})`,
    transform: `translateX(calc((100% / ${safeCount}) * ${safeIndex}))`,
  };
};

export function SegmentedToggle({
  items,
  activeValue,
  onChange,
  size = "md",
  className = "",
  listClassName = "",
  tabClassName = "",
  thumbClassName = "",
}: SegmentedToggleProps): ReactElement {
  const count = Math.max(1, items.length);
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.value === activeValue)
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumbStyle, setThumbStyle] = useState<CSSProperties>(() =>
    createFallbackThumbStyle(count, activeIndex)
  );

  // Синхронизируем количество ref с количеством элементов
  if (itemRefs.current.length !== count) {
    itemRefs.current.length = count;
  }

  // Пересчитываем fallback-стили при смене активного индекса/количества
  useEffect(() => {
    setThumbStyle((prev) => ({
      ...prev,
      ...createFallbackThumbStyle(count, activeIndex),
    }));
  }, [count, activeIndex]);

  // Рассчитываем фактическую ширину и смещение активной вкладки по измерениям DOM
  const updateThumb = useCallback(() => {
    const listEl = trackRef.current;
    const activeEl = itemRefs.current[activeIndex];

    if (!listEl || !activeEl) return;

    const listRect = listEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    setThumbStyle((prev) => {
      const nextStyle: CSSProperties = {
        width: activeRect.width,
        transform: `translateX(${activeRect.left - listRect.left}px)`,
      };
      return prev.width === nextStyle.width && prev.transform === nextStyle.transform
        ? prev
        : nextStyle;
    });
  }, [activeIndex]);

  // useLayoutEffect гарантирует, что thumb окажется на месте до отрисовки на экране.
  // В среде без DOM (SSR) useLayoutEffect не выполняется, что безопасно благодаря fallback-стилям.
  useLayoutEffect(() => {
    updateThumb();
  }, [updateThumb, count, items]);

  // ResizeObserver + window.resize для устойчивости при изменении размеров
  useEffect(() => {
    const handleResize = () => updateThumb();
    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && trackRef.current) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(trackRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
    };
  }, [updateThumb]);

  // Управление клавиатурой (roving tabindex):
  // - Левая/Правая стрелка — переключение активной вкладки.
  // - Home/End — переход к первой/последней.
  const moveFocus = (nextIndex: number) => {
    const bounded = Math.min(Math.max(nextIndex, 0), count - 1);
    const el = itemRefs.current[bounded];
    if (el) el.focus();
    const nextValue = items[bounded]?.value;
    if (nextValue && nextValue !== activeValue) {
      onChange(nextValue);
    }
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "Right": {
        e.preventDefault();
        moveFocus(index + 1);
        break;
      }
      case "ArrowLeft":
      case "Left": {
        e.preventDefault();
        moveFocus(index - 1);
        break;
      }
      case "Home": {
        e.preventDefault();
        moveFocus(0);
        break;
      }
      case "End": {
        e.preventDefault();
        moveFocus(count - 1);
        break;
      }
    }
  };

  return (
    /**
     * Плашка табов.
     * ВАЖНО: role="tablist" + кнопки с role="tab" и aria-selected — базовый a11y-паттерн без панелей.
     * Ширина: на узких экранах — по содержимому (w-fit), на широких можно задать через className.
     */
    <div
      role="tablist"
      aria-label="Переключатель"
      ref={trackRef}
      className={[
        "relative flex items-center rounded-2xl bg-white/10 backdrop-blur-xl",
        "h-12",
        "w-fit px-1",
        className,
      ]
        .join(" ")
        .trim()}
    >
      {/* Подсветка активной вкладки (thumb). Перемещается по transform и подстраивает ширину под активный таб. */}
      <div
        aria-hidden="true"
        className={[
          "absolute top-1 bottom-1 left-0 rounded-xl bg-white/60 shadow transition-all duration-300 ease-out motion-reduce:transition-none",
          thumbClassName,
        ]
          .join(" ")
          .trim()}
        style={thumbStyle}
      />

      {/* Список вкладок */}
      <div className={["relative z-10 flex min-w-full", listClassName].join(" ").trim()}>
        {items.map((it, i) => {
          const isActive = i === activeIndex;
          return (
            <Button
              key={it.value}
              type="button"
              variant="tab"
              size={size}
              // ARIA-семантика таба; roving tabindex — фокусируем только активный
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={[
                "flex-1 rounded-xl",
                "bg-transparent",
                "text-white/15 font-medium", // цвет неактивного текста; активный задаётся aria-классом в variant=tab
                tabClassName,
              ]
                .join(" ")
                .trim()}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              onClick={() => onChange(it.value)}
            >
              {it.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/* ======================== RangePresets ======================== */

export interface PresetOption {
  key: string;
  label: ReactNode;
}

interface RangePresetsProps {
  items: PresetOption[];
  value: string;
  onChange: (next: string) => void;
  className?: string; // классы для контейнера
  buttonClassName?: string; // классы для кнопок
  buttonSize?: ButtonSize;
}

export function RangePresets({
  items,
  value,
  onChange,
  className = "",
  buttonClassName = "",
  buttonSize = "md",
}: RangePresetsProps): ReactElement {
  return (
    <div
      className={[
        "flex flex-wrap items-end gap-2",
        "max-w-full overflow-x-auto", // на узких экранах допускаем горизонтальный скролл
        className,
      ]
        .join(" ")
        .trim()}
      role="listbox"
      aria-label="Пресеты диапазона"
    >
      {items.map((p) => {
        const active = value === p.key;
        return (
          <Button
            key={p.key}
            type="button"
            variant="pill"
            size={buttonSize}
            aria-selected={active}
            onClick={() => onChange(p.key)}
            className={[
              "shrink-0 rounded-lg",
              active ? "text-white/50 transition" : "bg-white/10 text-black/30 hover:bg-white/20",
              buttonClassName,
            ]
              .join(" ")
              .trim()}
          >
            {p.label}
          </Button>
        );
      })}
    </div>
  );
}
