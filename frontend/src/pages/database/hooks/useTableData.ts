/**
 * Хук управления данными таблицы.
 *
 * Зачем нужен:
 * - Объединяет в один поток логику вкладок, пагинации, поиска и фильтров.
 * - Дает единый, предсказуемый контракт для страниц “списков” (чаты, сообщения, заказы, брони).
 *
 * Что внутри:
 * - Вкладки: контролируемый перечень (см. TABS) — это защищает публичный API от неожиданных значений.
 * - Поиск: разделяем `q.input` (то, что печатает пользователь) и `q.value` (то, что уже применено к запросу).
 *   Это позволяет делать “отложенный” поиск (на Enter/по кнопке), без дерганья сети на каждый ввод.
 * - Фильтры: черновик (`filtersDraft`) и применённые (`filtersApplied`) — стандартный UX-паттерн
 *   “Применить/Сбросить” с предсказуемым поведением.
 * - Загрузка: `AbortController` отменяет прежний запрос при смене зависимости (вкладка/страница/фильтры/поиск),
 *   что предотвращает “гонки” и лишние setState — современная рекомендация для запросов в React 18+.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadRows, type ListFilters } from "../api/databaseApi";

/** Контролируемый перечень вкладок (тип выводится из значений, исключаем расхождения). */
const TABS = ["chats", "messages", "orders", "reservations"] as const;
type Tab = (typeof TABS)[number];

export type Query = { input: string; value: string };
type Filters = ListFilters;

/**
 * Универсальный хук загрузки и управления таблицей.
 * @param initialTab — стартовая вкладка (будет приведена к безопасному значению из TABS).
 */
export default function useTableData<T = unknown>(initialTab: Tab = "chats") {
  /** Внешний контракт доступных вкладок — пригодится для UI (рендер табов). */
  const tabs: readonly Tab[] = TABS;

  /** Храним “безопасную” вкладку: даже если извне придет неожиданное значение — нормализуем. */
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "chats");

  // Данные списка и статус загрузки
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // Пагинация
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Поиск: input — то, что в инпуте; value — уже примененное к запросу значение
  const [q, setQ] = useState<Query>({ input: "", value: "" });

  // Фильтры: черновик/примененные + состояние открытия панели фильтров
  const [filtersDraft, setFiltersDraft] = useState<Filters>({});
  const [filtersApplied, setFiltersApplied] = useState<Filters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** Применить фильтры: фиксируем черновик, сбрасываем страницу, закрываем панель. */
  const applyFilters = useCallback(() => {
    setFiltersApplied((prev) => {
      // Небольшая подсказка: если понадобится deep-compare, делайте здесь мемоизацию.
      return { ...filtersDraft };
    });
    setPage(1);
    setFiltersOpen(false);
  }, [filtersDraft]);

  /** Сбросить фильтры: чистый старт с первой страницы. */
  const resetFilters = useCallback(() => {
    setFiltersDraft({});
    setFiltersApplied({});
    setPage(1);
  }, []);

  /**
   * Смена вкладки:
   * - приводим к безопасному значению;
   * - сбрасываем пагинацию, поиск и фильтры, чтобы стартовать “с нуля” и не таскать контекст между разделами.
   */
  const switchTab = useCallback((nextTab: Tab) => {
    const safeTab: Tab = TABS.includes(nextTab) ? nextTab : "chats";
    setTab(safeTab);
    setPage(1);
    setQ({ input: "", value: "" });
    setFiltersDraft({});
    setFiltersApplied({});
    setFiltersOpen(false);
  }, []);

  /** Кол-во страниц: не даем упасть ниже 1 (удобно для UI пагинации). */
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  /**
   * Универсальный загрузчик данных. Принимает AbortSignal (если нужен),
   * чтобы можно было отменять запрос при смене условий. Возвращается промис,
   * так что функцию можно вызывать вручную (см. refetch).
   */
  const fetchData = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      try {
        const { items, total: totalCount } = await loadRows<T, Filters>(tab, {
          page,
          pageSize,
          qValue: q.value,
          filters: filtersApplied,
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        setRows(items);
        setTotal(totalCount);
      } catch (error: unknown) {
        if (signal?.aborted) {
          return;
        }

        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // eslint-disable-next-line no-console
          console.error(error);
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [filtersApplied, page, pageSize, q.value, tab],
  );

  /**
   * Эффект загрузки данных.
   * - Зависимости: вкладка, страница, размер страницы, примененные фильтры и примененное значение поиска.
   * - Отмена запроса на очистке эффекта — предотвращает гонки и setState на размонтированном компоненте.
   */
  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  /**
   * Публичный метод повторной загрузки (например, после сохранения записи).
   * Работает с текущими параметрами (таб, страница, фильтры).
   */
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    // данные для UI
    tabs,
    tab,
    rows,
    loading,
    total,
    page,
    pageSize,
    pages,
    q,
    filtersDraft,
    filtersApplied,
    filtersOpen,

    // экшены/сеттеры
    setPage,
    setPageSize,
    setQ,
    setFiltersDraft,
    setFiltersOpen,
    applyFilters,
    resetFilters,
    switchTab,
    refetch,
  };
}
