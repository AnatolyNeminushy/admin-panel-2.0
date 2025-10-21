import api from "../../services/api";

/**
 * Модуль API-хелперов для дэшборда/аналитики.
 *
 * Зачем это нужно:
 * - Держим логику запросов в одном месте: формирование query-параметров, проверка ответов, приведение типов.
 * - Снаружи получаем уже «чистые» данные в удобных структурах — UI не знает про детали REST эндпоинтов.
 *
 * Ключевые принципы:
 * - Явные типы на входах/выходах (TypeScript-friendly, полезно для автодополнения и читабельности).
 * - Безопасный парсинг JSON и аккуратная обработка «дырявых» полей (бэкенд бывает непоследовательным).
 * - Современный fetch API (2025): поддержка AbortSignal, RequestInit; никаких устаревших addListener и т.п.
 * - Предсказуемость: возвращаем пустые массивы вместо undefined/null, числа — через Number().
 *
 * Подсказка для будущего читателя:
 * - Если нужно отменять запрос при размонтировании компонента — пробрасывайте AbortSignal в функции ниже.
 * - Если появятся новые фильтры — расширяйте ChartFilters и normalizeRangeOptions, чтобы не ломать интерфейсы.
 */

const API_BASE = import.meta.env.VITE_API_URL as string;

/** Разрешённые пресеты периода (оставляем открытый союз — можно использовать кастомные строковые ключи). */
type PresetKey = "all" | "custom" | (string & {});

/** Вкладки графиков (оставляем расширяемость для будущих метрик). */
type ChartTab = "orders" | "reserves" | (string & {});

export interface ChartFilters {
  from?: string; // ISO-дата YYYY-MM-DD
  to?: string;   // ISO-дата YYYY-MM-DD
  preset?: PresetKey;
}

export interface ChartPoint {
  day: string; // YYYY-MM-DD
  count?: number;
  sum?: number;
  [key: string]: unknown;
}

export interface GlobalStats {
  orders: number;
  reserves: number;
  ordersSum: number;
  avg: number;
  maxDay: number;
}

export interface ListItem {
  id?: number | string;
  guest_name?: string;
  total_amount?: number | string;
  date?: string;
  [key: string]: unknown;
}

export interface ItemsByCategoryParams {
  level?: "category" | "child_category";
  metric?: "count" | "revenue";
  days?: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  delta: number | null;
}

export interface Highlights {
  repeatOrders: number;
  repeatReserves: number;
  topDish: {
    name: string;
    count: number;
  } | null;
}

/** Сырой ответ для хайлайтов — поля могут отсутствовать, поэтому всё опционально. */
interface HighlightsResponse {
  repeatOrders?: number;
  repeatReserves?: number;
  topDish?: {
    name?: string;
    count?: number;
  } | null;
  [key: string]: unknown;
}

interface PaginatedResponse<T> {
  items?: T[];
  [key: string]: unknown;
}

/**
 * Базовый JSON-запрос с проверкой статуса.
 * Почему так: fetch не кидает исключения на 4xx/5xx — делаем это сами, чтобы рантайм-ошибки ловились явно.
 *
 * @param url Полный URL
 * @param init Доп. опции fetch (метод, заголовки, body, signal и т.п.)
 * @throws Error, если ответ не ok (добавляем текст ответа, чтобы упростить дебаг)
 */
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new Error("VITE_API_URL не задан. Проверьте конфиг окружения.");
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    // Берём текст, если сервер прислал понятную ошибку
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  // В реальном мире иногда прилетает пустой ответ — подстрахуемся
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Ожидался JSON-ответ от сервера.");
  }

  return (await response.json()) as T;
}

/**
 * Получить точки для графика по активной вкладке (orders/reserves/…).
 * Под капотом формируем квери на сервер: /stat/<tab>-by-day
 *
 * Подсказка: если нужен all-временной диапазон — используйте preset: "all" (бек ожидает флаг all=1).
 */
export async function fetchChart(
  activeTab: ChartTab,
  { from, to, preset }: ChartFilters = {},
  options?: { signal?: AbortSignal }
): Promise<ChartPoint[]> {
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (preset === "all") params.set("all", "1");

  const path = `/stat/${encodeURIComponent(activeTab)}-by-day`;
  const query = params.toString();
  const url = `${API_BASE}${path}${query ? `?${query}` : ""}`;

  const data = await requestJson<ChartPoint[]>(url, { signal: options?.signal });
  return Array.isArray(data) ? data : [];
}

/**
 * Сводные метрики для «карточек» на дэшборде.
 * Зачем Promise.all: параллелим запросы, чтобы не выжигать время пользователя.
 */
export async function fetchGlobalStats(options?: { signal?: AbortSignal }): Promise<GlobalStats> {
  const [orders, reserves, ordersSum, extra] = await Promise.all([
    requestJson<{ count?: number }>(`${API_BASE}/stat/orders`, { signal: options?.signal }),
    requestJson<{ count?: number }>(`${API_BASE}/stat/reserves`, { signal: options?.signal }),
    requestJson<{ sum?: number }>(`${API_BASE}/stat/orders-sum`, { signal: options?.signal }),
    requestJson<{ avg?: number; maxDay?: number }>(`${API_BASE}/stat/orders-extra`, {
      signal: options?.signal,
    }),
  ]);

  return {
    orders: Number(orders?.count ?? 0),
    reserves: Number(reserves?.count ?? 0),
    ordersSum: Number(ordersSum?.sum ?? 0),
    avg: Number(extra?.avg ?? 0),
    maxDay: Number(extra?.maxDay ?? 0),
  };
}

export interface RangeOptions {
  limit?: number;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

type RangeArgument = RangeOptions | number | string | undefined;

/**
 * Нормализуем опции диапазона:
 * - Если пришло число/строка — воспринимаем как limit (частый кейс для «покажи N последних»).
 * - Если объект — возвращаем как есть.
 */
function normalizeRangeOptions(input: RangeArgument): RangeOptions {
  if (typeof input === "number" || typeof input === "string") {
    const limit = Number(input);
    return Number.isFinite(limit) ? { limit } : {};
  }
  return input ?? {};
}

/**
 * Универсальный фетчер списков (orders/reserves и т.п.) с пагинацией/ограничением.
 * Почему универсальный: чтобы не плодить дублирующий код и поддерживать единое поведение.
 */
async function fetchList(
  endpoint: string,
  options?: RangeArgument,
  extra?: { signal?: AbortSignal }
): Promise<ListItem[]> {
  const { limit, from, to } = normalizeRangeOptions(options);
  const params = new URLSearchParams();

  // NB: allow 0 — иногда полезно тестировать «пустой» ответ прокси/кэша
  if (limit != null) params.set("limit", String(limit));
  if (from) params.set("date_from", from);
  if (to) params.set("date_to", to);

  const query = params.toString();
  const url = `${API_BASE}/${endpoint}${query ? `?${query}` : ""}`;
  const data = await requestJson<PaginatedResponse<ListItem>>(url, { signal: extra?.signal });

  return Array.isArray(data?.items) ? data.items : [];
}

/** Последние/отфильтрованные заказы. */
export async function fetchOrders(
  options?: RangeArgument,
  extra?: { signal?: AbortSignal }
): Promise<ListItem[]> {
  return fetchList("orders", options, extra);
}

/** Последние/отфильтрованные бронирования. */
export async function fetchReserves(
  options?: RangeArgument,
  extra?: { signal?: AbortSignal }
): Promise<ListItem[]> {
  return fetchList("reserves", options, extra);
}

/**
 * Диаграмма распределения по категориям.
 * Здесь используем заранее сконфигурированный axios-инстанс (cookie/withCredentials и пр. уже настроены в сервисе).
 *
 * Подсказка: если переводите всё на fetch — сохраните единый стиль (один транспорт во всём проекте),
 * чтобы не было «зоопарка» и разной обработки ошибок.
 */
export async function fetchItemsByCategory(
  params: ItemsByCategoryParams = {},
  extra?: { signal?: AbortSignal }
): Promise<CategorySlice[]> {
  // axios не принимает AbortSignal как signal в config по умолчанию старыми версиями,
  // но в актуальных версиях поддержка есть. Если у вас старая — используйте { cancelToken }.
  const { data } = await api.get<CategorySlice[]>("/stat/items-by-category", {
    params,
    withCredentials: true,
    signal: extra?.signal,
  });

  return Array.isArray(data) ? data : [];
}

/**
 * «Хайлайты» — быстрые факты для верхней панели: ретеншн по заказам/бронированиям, топ-блюдо и т.п.
 * Почему маппим руками: backend может прислать null/undefined — UI не должен от этого ломаться.
 */
export async function fetchHighlights(
  options?: { signal?: AbortSignal }
): Promise<Highlights> {
  const data = await requestJson<HighlightsResponse>(`${API_BASE}/stat/highlights`, {
    signal: options?.signal,
  });

  return {
    repeatOrders: Number(data?.repeatOrders ?? 0),
    repeatReserves: Number(data?.repeatReserves ?? 0),
    topDish: data?.topDish?.name
      ? {
          name: String(data.topDish.name),
          count: Number(data.topDish.count ?? 0),
        }
      : null,
  };
}
