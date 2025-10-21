/**
 * Аналитическая страница: сводные метрики, графики и списки по заказам/бронированиям.
 *
 * Зачем этот файл:
 * - Даёт быстрый «дашборд» по ключевым KPI: количество заказов/брони, сумма, средний чек.
 * - Показывает динамику по дням (line chart) и распределение по категориям (pie chart).
 * - Позволяет отфильтровать и отсортировать списки (по имени гостя, сумме, дате).
 *
 * Что важно для читателя/поддержки:
 * - Код уже подготовлен к «грязным» данным API: много nullable-полей, строки с числами и пр.
 * - Внутренние хелперы нормализуют даты/время и защищают от некорректных значений.
 * - setState вызывается только когда компонент «живой» (см. флаг mounted); это безопасный паттерн
 *   на случай медленных запросов без AbortController.
 * - Строгая типизация входных данных и трансформаций (в т.ч. защитные преобразования).
 */

import { useEffect, useMemo, useState } from "react";

import { PRESETS } from "./constants";
import { fmtISO, addDays } from "./utils/date";
import { sortItems } from "./utils/sort";
import {
  fetchChart,
  fetchGlobalStats,
  fetchOrders,
  fetchReserves,
  fetchItemsByCategory,
  fetchHighlights,
} from "./api";
import type { CategorySlice, Highlights as ApiHighlights } from "./api";

import StatCard from "./components/StatCard";
import SortControls, { SortState as SortControlState } from "./components/SortControls";
import SmoothChart, { type ChartDatum } from "./components/SmoothChart";
import ListTable from "./components/ListTable";
import OrdersPieChart from "./components/PieChart";

import ordersIcon from "../../assets/icons/analytics/orders-icon.svg";
import reservationsIcon from "../../assets/icons/analytics/reservations-icon.svg";
import sumIcon from "../../assets/icons/analytics/sum-icon.svg";
import receiptIcon from "../../assets/icons/analytics/receipt-icon.svg";

import { SegmentedToggle, RangePresets } from "@/components/Button";

// ---------- Типы домена и UI-состояния ----------

export type Tab = "orders" | "reserves";

export interface GlobalStats {
  orders: number;
  reserves: number;
  ordersSum: number;
  avg: number;
  maxDay: number;
}

export interface ChartApiPoint {
  day: string; // ISO date от API
  count?: number | string | null;
  sum?: number | string | null;
}

export type ChartPoint = ChartDatum;

export interface OrderItem {
  guest_name?: string;
  total_amount?: number | string | null;
  date?: string | Date | null;
  time?: string | null;
  created_at?: string | Date | number | null;
  createdAt?: string | Date | number | null;
  created?: string | Date | number | null;
  datetime?: string | Date | number | null;
  createdTs?: string | Date | number | null;
  [k: string]: unknown;
}

export interface ReserveItem {
  guest_name?: string;
  total_amount?: number | string | null;
  date?: string | Date | null;
  time?: string | null;
  [k: string]: unknown;
}

export interface FilterState {
  q: string;
  min: string; // держим строкой для контролируемого <input type="number"/>
  max: string;
}

export interface HighlightsData {
  repeatOrders: number;
  repeatReserves: number;
  topDish: null | { name: string; count: number | string };
}

const HIGHLIGHTS_DEFAULT: HighlightsData = {
  repeatOrders: 0,
  repeatReserves: 0,
  topDish: null,
};

type OrderSortKey = "date" | "guest_name" | "total_amount";
type ReserveSortKey = "date" | "guest_name" | "time";

const ORDER_SORT_OPTIONS: ReadonlyArray<{ value: OrderSortKey; label: string }> = [
  { value: "date", label: "Дата" },
  { value: "guest_name", label: "Гость" },
  { value: "total_amount", label: "Сумма" },
];

const RESERVE_SORT_OPTIONS: ReadonlyArray<{ value: ReserveSortKey; label: string }> = [
  { value: "date", label: "Дата" },
  { value: "guest_name", label: "Гость" },
  { value: "time", label: "Время" },
];

// Локальный тип для пресетов диапазона.
// Важно: не меняем исходный модуль, а лишь уточняем тип снаружи.
type RangePreset = { key: string; label: string; days?: number };

// Безопасно «сужаем» тип PRESETS: теперь .find даст типизированный объект.
const TYPED_PRESETS = PRESETS as readonly RangePreset[];

// Значения по умолчанию для фильтров/диапазона.
const DEFAULT_TAB: Tab = "orders";
const DEFAULT_PRESET_KEY = "all";

export default function AnalyticsPage() {
  // --- Маппинг хайлайтов API → UI-данные. Здесь инкапсулируем «грязь» API. ---
  const mapHighlights = (src?: ApiHighlights | null): HighlightsData => ({
    repeatOrders: src?.repeatOrders ?? 0,
    repeatReserves: src?.repeatReserves ?? 0,
    topDish:
      src?.topDish && src.topDish.name
        ? { name: String(src.topDish.name), count: src.topDish.count ?? 0 }
        : null,
  });

  // --- Глобальные сводные показатели ---
  const [stats, setStats] = useState<GlobalStats & { loading: boolean }>({
    orders: 0,
    reserves: 0,
    ordersSum: 0,
    avg: 0,
    maxDay: 0,
    loading: true,
  });

  // --- Верхние контролы: табы и диапазоны ---
  const [activeTab, setActiveTab] = useState<Tab>(DEFAULT_TAB);
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET_KEY);

  // Почему именно так инициализируем даты:
  // - При монтировании показываем «последние 7 дней» (UX-ожидание «есть данные сразу»).
  // - Если выбран пресет "all", ниже мы сбросим строки в пустые значения.
  const initialFrom = fmtISO(addDays(new Date(), -6));
  const initialTo = fmtISO(new Date());
  const [from, setFrom] = useState<string>(initialFrom);
  const [to, setTo] = useState<string>(initialTo);

  useEffect(() => {
    // Реакция на смену пресета: вычисляем новый диапазон.
    const today = new Date();

    if (preset === "custom") {
      // Пользователь выберет диапазон руками (здесь мы ничего не трогаем).
      return;
    }
    if (preset === "all") {
      // Пустые строки → API понимает «без ограничения».
      setFrom("");
      setTo("");
      return;
    }
    // Ищем пресет по ключу, с дефолтом на 7 дней.
    const presetDef = TYPED_PRESETS.find((p) => p.key === preset);
    const days = presetDef?.days ?? 7;
    const start = addDays(today, -(days - 1));
    setFrom(fmtISO(start));
    setTo(fmtISO(today));
  }, [preset]);

  // --- Линейный график ---
  const [chartLoading, setChartLoading] = useState<boolean>(true);
  const [chartData, setChartData] = useState<ChartApiPoint[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setChartLoading(true);
        const data = await fetchChart(activeTab, { from, to, preset });
        if (!mounted) return;
        setChartData(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setChartData([]);
      } finally {
        if (mounted) setChartLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, from, to, preset]);

  // --- Сводные показатели (карточки) ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setStats((s) => ({ ...s, loading: true }));
        const s = await fetchGlobalStats();
        if (mounted) setStats({ ...(s as GlobalStats), loading: false });
      } catch {
        if (mounted) setStats((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // --- Pie chart: популярные категории + хайлайты ---
  const [pieData, setPieData] = useState<CategorySlice[]>([]);
  const [pieHighlights, setPieHighlights] = useState<HighlightsData>(HIGHLIGHTS_DEFAULT);
  const [pieLoading, setPieLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setPieLoading(true);
        const [items, highlightsData] = await Promise.all([
          fetchItemsByCategory({
            level: "category",
            metric: "count",
            days: undefined, // оставляем API принять дефолт
          }),
          fetchHighlights(),
        ]);
        if (!mounted) return;
        setPieData(Array.isArray(items) ? items : []);
        setPieHighlights(mapHighlights(highlightsData));
      } catch (e) {
        // Почему логируем: при интеграции с реальным API это поможет быстро локализовать проблему.
        console.error("Ошибка загрузки данных для круговой диаграммы:", e);
        if (mounted) {
          setPieData([]);
          setPieHighlights(HIGHLIGHTS_DEFAULT);
        }
      } finally {
        if (mounted) setPieLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // --- Трансформация данных для графика (из API → в UI-friendly формат) ---
  const days = useMemo<ChartDatum[]>(() => {
    return chartData
      .slice()
      .reverse()
      .map((r) => ({
        dayISO: r.day,
        day: new Date(r.day).toLocaleDateString("ru-RU", { month: "2-digit", day: "2-digit" }),
        count: Number(r.count ?? 0) || 0,
        sum: Number(r.sum ?? 0) || 0,
      }));
  }, [chartData]);

  // --- Табличные списки ---
  const [ordersList, setOrdersList] = useState<OrderItem[]>([]);
  const [reservesList, setReservesList] = useState<ReserveItem[]>([]);

  const [orderFilter, setOrderFilter] = useState<FilterState>({ q: "", min: "", max: "" });
  const [reserveFilter, setReserveFilter] = useState<FilterState>({ q: "", min: "", max: "" });

  const [orderSort, setOrderSort] = useState<SortControlState<OrderSortKey>>({
    by: "date",
    dir: "desc",
  });
  const [reserveSort, setReserveSort] = useState<SortControlState<ReserveSortKey>>({
    by: "date",
    dir: "desc",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Формируем опции только с непустыми границами.
        const rangeOpts: Record<string, unknown> = {
          limit: 5000,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        };

        const [o, r] = await Promise.all([fetchOrders(rangeOpts), fetchReserves({ ...rangeOpts })]);
        if (!mounted) return;
        setOrdersList((o ?? []) as OrderItem[]);
        setReservesList((r ?? []) as ReserveItem[]);
      } catch {
        if (!mounted) return;
        setOrdersList([]);
        setReservesList([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [from, to]);

  // ---------- Хелперы дат/времени (устойчивые к «грязному» вводу) ----------

  /** Превращает ISO-дату в границу дня [00:00:00.000], с опциональным сдвигом на addDaysVal. */
  const toBoundary = (iso: string | Date | null | undefined, addDaysVal = 0): Date | null => {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.valueOf())) return null;
    dt.setHours(0, 0, 0, 0);
    if (addDaysVal) dt.setDate(dt.getDate() + addDaysVal);
    return dt;
  };

  /** Пытается распарсить что угодно в Date | null. Удобно для полей API с различными форматами. */
  const parseDateLike = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getTime());
    const dt = new Date(value as string);
    return Number.isNaN(dt.valueOf()) ? null : dt;
  };

  /** Разбор строки времени "HH:mm" в объект с часами и минутами, с отсеиванием мусора. */
  const parseTimeLike = (value: unknown): { hours: number; minutes: number } | null => {
    if (value == null) return null;
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Math.min(23, Math.max(0, Number(match[1]) || 0));
    const minutes = Math.min(59, Math.max(0, Number(match[2]) || 0));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return { hours, minutes };
  };

  /**
   * Склеивает дату и время в один Date.
   * Полезные режимы:
   * - requireTime: если времени нет — считаем, что данных недостаточно (вернём null).
   * - fallbackToMidnight: если времени нет — используем 00:00.
   */
  const combineDateTime = (
    dateValue: unknown,
    timeValue: unknown,
    opts: { requireTime?: boolean; fallbackToMidnight?: boolean } = {}
  ): Date | null => {
    const { requireTime = false, fallbackToMidnight = false } = opts;
    const base = parseDateLike(dateValue);
    if (!base) return null;
    const time = parseTimeLike(timeValue);
    if (!time) {
      if (requireTime) return null;
      if (!fallbackToMidnight) return null;
    }
    const dt = new Date(base.getTime());
    if (time) dt.setHours(time.hours, time.minutes, 0, 0);
    else dt.setHours(0, 0, 0, 0);
    return dt;
  };

  // Склонение числительных: 1 форма, 2-4 форма, 5+ форма.
  const declOfNum = (value: number, forms: [string, string, string]): string => {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
    return forms[2];
  };

  /**
   * Вычисляет «пиковый час» — в какой час суток больше всего элементов в списке.
   * Почему считаем на клиенте: дешёво для UI и не требует изменений на стороне API.
   */
  const computePeakHour = <T,>(
    list: T[],
    params: {
      fromISO: string;
      toISO: string;
      getTimestamp: (item: T) => Date | null;
      forms?: [string, string, string];
      label?: string;
    }
  ) => {
    const { fromISO, toISO, getTimestamp } = params;
    const items = Array.isArray(list) ? list : [];
    const fromDate = toBoundary(fromISO);
    const toDateExclusive = toBoundary(toISO, 1);

    const formsSafe = (
      params.forms && params.forms.length >= 3 ? params.forms : ["запись", "записи", "записей"]
    ) as [string, string, string];
    const labelSafe = params.label || "Пиковый час";

    const buckets = Array.from({ length: 24 }, () => 0);
    let bestHour = 0;
    let bestCount = 0;
    let hasData = false;

    for (const item of items) {
      const dt = getTimestamp(item);
      if (!dt) continue;
      if (fromDate && dt < fromDate) continue;
      if (toDateExclusive && dt >= toDateExclusive) continue;
      hasData = true;
      const hour = dt.getHours();
      buckets[hour] += 1;
      if (buckets[hour] > bestCount) {
        bestCount = buckets[hour];
        bestHour = hour;
      }
    }

    return {
      value: `${String(bestHour).padStart(2, "0")}:00`,
      subtitle: `${bestCount.toLocaleString("ru-RU")} ${declOfNum(bestCount, formsSafe)}`,
      hour: bestHour,
      count: bestCount,
      label: labelSafe,
      hasData,
    } as const;
  };

  // Пиковые часы для разных сущностей считаем отдельно.
  const ordersPeakHour = useMemo(() => {
    return computePeakHour(ordersList, {
      fromISO: from,
      toISO: to,
      forms: ["заказ", "заказа", "заказов"],
      label: "Пиковый час по заказам",
      getTimestamp: (order: OrderItem) => {
        // 1) Основной источник — (date + time)
        const primary = combineDateTime(order?.date, order?.time);
        if (primary) return primary;

        // 2) Фолбэки по различным полям времени из API.
        const fallbacks = [
          order?.created_at,
          order?.createdAt,
          order?.created,
          order?.datetime,
          order?.createdTs,
        ];
        for (const raw of fallbacks) {
          const fallbackDate = parseDateLike(raw);
          if (!fallbackDate) continue;
          const time = parseTimeLike(order?.time);
          if (time) {
            const dt = new Date(fallbackDate.getTime());
            dt.setHours(time.hours, time.minutes, 0, 0);
            return dt;
          }
          return fallbackDate;
        }
        return null;
      },
    });
  }, [ordersList, from, to]);

  const reservesPeakHour = useMemo(() => {
    return computePeakHour(reservesList, {
      fromISO: from,
      toISO: to,
      forms: ["бронь", "брони", "броней"],
      label: "Пиковый час по бронированиям",
      getTimestamp: (reserve: ReserveItem) =>
        combineDateTime(reserve?.date, reserve?.time, { requireTime: true }),
    });
  }, [reservesList, from, to]);

  // --- Фильтрация + сортировка списков ---
  const filteredOrders = useMemo(() => {
    const q = orderFilter.q.trim().toLowerCase();
    const min = Number(orderFilter.min || 0);
    const max = Number(orderFilter.max || 0);

    const base = ordersList.filter((it) => {
      const guest = String(it.guest_name || "").toLowerCase();
      const total = Number(it.total_amount || 0);
      const byQ = !q || guest.includes(q);
      const byMin = !min || total >= min;
      const byMax = !max || total <= max;
      return byQ && byMin && byMax;
    });

    // Узкий тип ключей уменьшает шанс ошибиться в поле сортировки.
    return sortItems<OrderItem>(base, orderSort);
  }, [ordersList, orderFilter, orderSort]);

  const filteredReserves = useMemo(() => {
    const q = reserveFilter.q.trim().toLowerCase();

    const base = reservesList.filter((it) => {
      const guest = String(it.guest_name || "").toLowerCase();
      // В бронях сумма не всегда релевантна — оставили только поиск по гостю (как в дизайне).
      return !q || guest.includes(q);
    });

    return sortItems<ReserveItem>(base, reserveSort);
  }, [reservesList, reserveFilter, reserveSort]);

  // ---------- Разметка ----------

  return (
    <div className="h-full min-h-0 mt-14 lg:mt-8">
      {/* Карточки со сводными показателями: на мобилке 2x2, на xl — сетка 4 в ряд */}
      {stats.loading ? (
        <div className="text-gray-500 text-center p-[5%]" role="status" aria-live="polite">
          Загрузка данных...
        </div>
      ) : (
        <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-6 mb-3 md:mb-6">
          <StatCard
            icon={<img src={ordersIcon} alt="Иконка заказов" />}
            label="Всего заказов"
            value={stats.orders}
          />
          <StatCard
            icon={<img src={reservationsIcon} alt="Иконка бронирований" />}
            label="Всего бронирований"
            value={stats.reserves}
          />
          <StatCard
            icon={<img src={sumIcon} alt="Иконка суммы заказов" />}
            label="Сумма заказов"
            value={`${stats.ordersSum.toLocaleString("ru-RU")} ₽`}
          />
          <StatCard
            icon={<img src={receiptIcon} alt="Иконка среднего чека" />}
            label="Средний чек"
            value={`${stats.avg.toLocaleString("ru-RU")} ₽`}
          />
        </div>
      )}

      {/* График и круговая диаграмма: на мобилке столбиком, на lg+ — два столбца */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6 mb-3 md:mb-6">
        <div className="bg-surface p-6 sm:p-8 flex flex-col">
          {/* Верхние переключатели: на мобилке в столбик, на md+ в строку/колонку */}
          <div className="flex flex-col gap-3 mb-6 md:flex-row lg:flex-col 2xl:flex-row">
            {/* Табы */}
            <SegmentedToggle
              items={[
                { value: "orders", label: "Заказы" },
                { value: "reserves", label: "Брони" },
              ]}
              activeValue={activeTab}
              onChange={(v) => setActiveTab(v as Tab)}
            />

            {/* Пресеты диапазона */}
            <div className="flex flex-wrap">
              <RangePresets items={[...TYPED_PRESETS]} value={preset} onChange={setPreset} />
            </div>
          </div>

          {/* График */}
          <div className="flex flex-1 flex-col">
            <h2 className="font-medium text-white/30 pl-4 text-body md:text-base">
              {activeTab === "orders"
                ? "Динамика заказов (сумма)"
                : "Динамика бронирований (кол-во)"}
            </h2>
            {chartLoading ? (
              <div
                className="flex flex-1 items-center justify-center p-8 text-white/30 text-center"
                role="status"
                aria-live="polite"
              >
                Загрузка графика...
              </div>
            ) : (
              <div className="flex-1">
                <SmoothChart
                  data={days}
                  yKey={activeTab === "orders" ? "sum" : "count"}
                  height={240}
                  // Пик-инфо добавляет «контекстную подсказку» к графику.
                  peakInfo={
                    activeTab === "orders"
                      ? (ordersPeakHour as unknown as any)
                      : (reservesPeakHour as unknown as any)
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Популярные категории */}
        <div className="bg-surface p-6 sm:p-8">
          {pieLoading ? (
            <div className="text-white/30 text-center p-12" role="status" aria-live="polite">
              Загрузка…
            </div>
          ) : (
            <OrdersPieChart data={pieData} highlights={pieHighlights} />
          )}
        </div>
      </div>

      {/* Списки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6 pb-4 lg:pb-8">
        {/* Заказы */}
        <div className="bg-surface rounded-3xl shadow">
          <div className="p-3 sm:p-4 border-b rounded-t-2xl overflow-visible">
            <div className="font-medium text-body text-white/40 mb-3">Заказы</div>
            <div className="flex gap-2 flex-row flex-wrap md:items-center">
              <input
                placeholder="Имя гостя"
                className="bg-white/10 text-body max-w-[170px] rounded-lg px-3 py-2 w-full min-w-0 transition focus:outline-none focus:border-black/30"
                value={orderFilter.q}
                onChange={(e) => setOrderFilter((f) => ({ ...f, q: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Мин, ₽"
                className="bg-white/10 text-body rounded-lg px-3 py-2 w-full max-w-28 transition focus:outline-none focus:border-black/30"
                value={orderFilter.min}
                onChange={(e) => setOrderFilter((f) => ({ ...f, min: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Макс, ₽"
                className="bg-white/10 text-body rounded-lg px-3 py-2 w-full max-w-28 focus:outline-none focus:border-black/30"
                value={orderFilter.max}
                onChange={(e) => setOrderFilter((f) => ({ ...f, max: e.target.value }))}
              />
              <SortControls<OrderSortKey>
                sort={orderSort}
                onChange={setOrderSort}
                options={ORDER_SORT_OPTIONS}
              />
              <button
                type="button"
                className="text-body p-1 bg-white/20 text-black/30 hover:bg-white/5 active:bg-white/10 transition rounded-lg self-end md:self-auto md:ml-auto"
                onClick={() => setOrderFilter({ q: "", min: "", max: "" })}
              >
                Сбросить
              </button>
            </div>
          </div>

          {/* Таблица: горизонтальная прокрутка включена только для маленьких экранов */}
          <div className="rounded-b-2xl overflow-hidden">
            <div className="overflow-x-auto min-w-0" data-scroll-pad>
              <div className="w-full min-w-0">
                <ListTable items={filteredOrders} />
              </div>
            </div>
          </div>
        </div>

        {/* Брони */}
        <div className="bg-surface rounded-3xl shadow">
          <div className="p-3 sm:p-4 border-b rounded-t-2xl overflow-visible">
            <div className="font-medium text-body text-white/40 mb-3">Брони</div>
            <div className="flex gap-2 flex-row flex-wrap md:items-center">
              <input
                placeholder="Имя гостя"
                className="bg-white/10 text-body rounded-lg px-3 py-2 w-full max-w-[170px] min-w-0 transition focus:outline-none focus:border-black/30"
                value={reserveFilter.q}
                onChange={(e) => setReserveFilter((f) => ({ ...f, q: e.target.value }))}
              />
              <SortControls<ReserveSortKey>
                sort={reserveSort}
                onChange={setReserveSort}
                options={RESERVE_SORT_OPTIONS}
              />
              <button
                type="button"
                className="text-body p-1 bg-white/20 text-black/30 hover:bg-white/5 active:bg-white/10 transition rounded-lg self-end md:self-auto md:ml-auto"
                onClick={() => setReserveFilter({ q: "", min: "", max: "" })}
              >
                Сбросить
              </button>
            </div>
          </div>

          {/* Таблица: горизонтальная прокрутка включена только для маленьких экранов */}
          <div className="rounded-b-2xl overflow-hidden">
            <div className="overflow-x-auto min-w-0" data-scroll-pad>
              <div className="w-full min-w-0">
                <ListTable items={filteredReserves} showAmount={false} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
