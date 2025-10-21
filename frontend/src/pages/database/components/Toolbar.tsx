/**
 * Поисковый тулбар для списков.
 *
 * Что делает:
 * - Управляет строкой поиска и UX-кнопками (Сбросить).
 * - Дебаунсит ввод, чтобы не спамить бекенд лишними запросами при печати.
 * - Поддерживает submit по Enter (через <form>) и явной кнопкой внутри SearchBar.
 *
 * Почему так:
 * - Debounce реализован на уровне эффекта и сравнивает q.input (то, что печатает пользователь)
 *   с q.value (последний «зафиксированный» запрос). Если они совпадают — новый запрос не шлём.
 * - Храним актуальный onSearch в ref (onSearchRef), чтобы избежать «застывших» замыканий
 *   при смене пропсов и при этом не пересоздавать таймер.
 * - Таймер держим в ref, корректно чистим при каждом изменении и при размонтировании.
 */

import {
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import Button from "@/components/Button";
import SearchBar from "@/components/SearchBar";

const DEBOUNCE_DELAY_MS = 150;

export type SearchState = {
  input: string;
  value: string;
};

export type ToolbarProps = {
  q: SearchState;
  setQ: Dispatch<SetStateAction<SearchState>>;
  onSearch: () => void;
  onClear: () => void;
  total: number;
  loading: boolean;
};

export default function Toolbar({
  q,
  setQ,
  onSearch,
  onClear,
  total,
  loading,
}: ToolbarProps) {
  // Храним ID таймера, чтобы гарантированно чистить debounce при каждом изменении строки поиска.
  // ReturnType<typeof setTimeout> — кроссплатформенно (браузер/Node типы).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // useRef вместо зависимости в setTimeout: избегаем проблем со stale-замыканиями на onSearch.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Основная логика дебаунса: реагируем на ввод, но шлём поиск только если input != value.
  useEffect(() => {
    if (debounceRef.current !== undefined) {
      clearTimeout(debounceRef.current);
    }

    const trimmedInput = q.input.trim();
    if (trimmedInput === q.value) {
      return undefined; // уже искали это значение — не дергаем onSearch заново
    }

    debounceRef.current = setTimeout(() => {
      // Берём актуальную версию onSearch из ref — без пересоздания эффекта.
      onSearchRef.current();
    }, DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceRef.current !== undefined) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [q.input, q.value]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  }, [onSearch]);

  const hasActiveQuery = q.value.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      {/* Держим форму, чтобы Enter в поле запускал поиск даже без клика по кнопке. */}
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[560px] items-center gap-2 md:flex-1 md:max-w-none md:justify-center"
      >
        {/* Контейнер управляет шириной поля, чтобы не завозить дополнительный layout-код. */}
        <div className="w-full min-w-[240px] sm:w-[320px] lg:w-[520px] md:mx-auto">
          <SearchBar
            compact
            placeholder="Поиск"
            value={q.input}
            onChange={(value) => setQ((prev) => ({ ...prev, input: value }))}
            onSubmit={onSearch}
            onClear={onClear}
          />
        </div>

        {hasActiveQuery ? (
          <Button
            type="button"
            onClick={onClear}
            variant="accent"
            size="md"
            className="opacity-70 hover:opacity-100"
          >
            Сбросить
          </Button>
        ) : null}
      </form>

      {/* aria-live — мягкое оповещение для экранных читалок при смене количества результатов. */}
      <div className="text-body text-slate-500 md:ml-auto text-center md:text-right" aria-live="polite">
        {loading ? "Загрузка..." : `Найдено: ${total}`}
      </div>
    </div>
  );
}
