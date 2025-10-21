import { useEffect, useId, useMemo, useRef, useState } from "react";
import arrowIcon from "@/assets/icons/general/back.svg";

/**
 * Компонент «SortControls»
 *
 * Что делает:
 * - Позволяет пользователю выбрать поле сортировки (дата / гость / сумма и т.п.) и направление (asc/desc).
 * - Работает как компактный дропдаун + переключатель направления.
 *
 * Зачем это так сделано:
 * - Управление состоянием сортировки вынесено наружу через `onChange(updater)` — паттерн идентичен `setState`.
 * - Дропдаун реагирует на pointer-события, закрывается по клику вне, Esc и спустя небольшую задержку после ухода курсора.
 */

export type SortDirection = "asc" | "desc";

export interface SortState<By extends string = "date" | "guest_name" | "total_amount"> {
  by: By;
  dir: SortDirection;
}

type SortOption<T extends string> = { value: T; label: string };

interface SortControlsProps<T extends string = "date" | "guest_name" | "total_amount"> {
  sort: SortState<T>;
  onChange: (updater: (prev: SortState<T>) => SortState<T>) => void;
  options?: ReadonlyArray<SortOption<T>>;
}

const DEFAULT_OPTIONS: ReadonlyArray<SortOption<"date" | "guest_name" | "total_amount">> = [
  { value: "date", label: "Дата" },
  { value: "guest_name", label: "Гость" },
  { value: "total_amount", label: "Сумма" },
];

export default function SortControls<T extends string = "date" | "guest_name" | "total_amount">({
  sort,
  onChange,
  options,
}: SortControlsProps<T>) {
  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerId = useId();
  const closeTimeoutRef = useRef<number | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openDropdown = () => {
    clearCloseTimeout();
    setOpen(true);
  };

  const closeDropdown = () => {
    clearCloseTimeout();
    setOpen(false);
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 150);
  };

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      const path = (event.composedPath?.() ?? []) as EventTarget[];
      const root = containerRef.current;
      if (!root) return;
      if (!path.includes(root)) {
        closeDropdown();
      }
    };
    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDropdown();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, []);

  const normalizedOptions = useMemo(() => {
    if (options && options.length > 0) {
      return options;
    }
    return DEFAULT_OPTIONS as ReadonlyArray<SortOption<T>>;
  }, [options]);

  useEffect(() => {
    if (!normalizedOptions.some((opt) => opt.value === sort.by) && normalizedOptions.length > 0) {
      const fallback = normalizedOptions[0]?.value;
      if (fallback) {
        onChange((prev) => ({ ...prev, by: fallback }));
      }
    }
  }, [normalizedOptions, sort.by, onChange]);

  const currentLabel =
    normalizedOptions.find((option) => option.value === sort.by)?.label ??
    normalizedOptions[0]?.label ??
    "";

  const handleSelect = (value: SortState<T>["by"]) => {
    onChange((prev) => ({ ...prev, by: value }));
    closeDropdown();
  };

  const handlePointerEnter = () => openDropdown();
  const handlePointerLeave = () => scheduleClose();

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={triggerId}>
        Сортировать по
      </label>

      <div
        className="relative"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <button
          type="button"
          id={triggerId}
          className="flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-body font-medium text-white/30 transition focus:outline-none"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? closeDropdown() : openDropdown())}
        >
          <span>{currentLabel}</span>
          <img
            src={arrowIcon}
            alt=""
            aria-hidden="true"
            className={`h-3 w-2 select-none transition-transform ${
              open ? "-rotate-90" : "rotate-90"
            }`}
          />
        </button>

        {open ? (
          <div
            role="listbox"
            aria-labelledby={triggerId}
            className="absolute z-30 mt-2 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-md"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            {normalizedOptions.map((option) => {
              const selected = option.value === sort.by;
              const optionClasses = [
                "flex w-full items-center justify-between px-3 py-1.5 text-left text-body transition",
                "hover:bg-primary/10",
                selected ? "bg-primary/10 text-primary" : "text-black/30",
              ].join(" ");

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={optionClasses}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                  {selected ? (
                    <span aria-hidden="true" className="text-body">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="flex h-9 items-center gap-2 rounded-lg bg-white/30 px-2 text-body text-gray-600 transition hover:bg-white/50"
        title={sort.dir === "asc" ? "Сортировать по возрастанию" : "Сортировать по убыванию"}
        onClick={() =>
          onChange((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))
        }
        aria-label={
          sort.dir === "asc"
            ? "Переключить направление сортировки на убывание"
            : "Переключить направление сортировки на возрастание"
        }
      >
        <span className="sr-only">Изменить направление сортировки</span>
        <img
          src={arrowIcon}
          alt=""
          aria-hidden="true"
          className={`h-3 w-2 select-none transition-transform ${
            sort.dir === "asc" ? "-rotate-90" : "rotate-90"
          }`}
        />
      </button>
    </div>
  );
}
