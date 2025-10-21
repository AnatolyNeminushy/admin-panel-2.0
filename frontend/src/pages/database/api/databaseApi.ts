/**
 * Утилиты для построения URL, загрузки, сохранения и удаления строк в разделах
 * “чаты / сообщения / заказы / бронирования”.
 *
 * Зачем это нужно:
 * - Централизуем всю работу со списками и CRUD-операциями: одна точка входа → меньше дублирования.
 * - Типобезопасность на 2025-й: узкие типы, исчерпывающие проверки по вкладкам, явные контракты данных.
 * - Предсказуемость API: единая сборка query-параметров и единая обработка ошибок.
 *
 * Нюансы, на которые стоит обратить внимание:
 * - `TabName` — это union из значений `TABS`. Переключение по вкладкам реализовано через `switch`
 *   с исчерпывающей проверкой (`assertNever`). Это избавляет от “тихих” регрессий при добавлении новых вкладок.
 * - Фильтры числовых диапазонов (например, `min_total`) добавляются только если значение «реально задано».
 *   Пустые строки и `null/undefined` игнорируются — так мы не отправляем мусорных параметров.
 * - Заголовок `X-Total-Count` приоритетнее для total; если его нет — используем `data.total`.
 * - `cache: 'no-store'` у `fetch` помогает видеть свежие данные (часто важно в админках).
 * - Ошибки сетевых операций развёрнутые: статус + тело ответа (если есть), чтобы проще дебажить запросы.
 */

const API_BASE = import.meta.env.VITE_API_URL?.toString().replace(/\/+$/, "");
if (!API_BASE) {
  throw new Error("VITE_API_URL is not defined");
}

/** Фиксированный реестр вкладок (const-объект → безопасный union для ключей). */
export const TABS = {
  CHATS: "chats",
  MESSAGES: "messages",
  ORDERS: "orders",
  RESERVATIONS: "reservations",
} as const;

export type TabName = (typeof TABS)[keyof typeof TABS];

/** Допустимые значения для произвольных фильтров. */
type FilterValue = string | number | null | undefined;

/**
 * Базовый контракт фильтров для списков.
 * Можно расширять дженериком, добавляя свои поля поверх этих.
 */
export interface ListFilters {
  platform?: string;
  order_type?: string;
  date_from?: string;
  date_to?: string;
  min_total?: FilterValue;
  max_total?: FilterValue;
  min_guests?: FilterValue;
  max_guests?: FilterValue;
  /** Разрешаем передавать кастомные ключи фильтров (например, “status”). */
  [key: string]: FilterValue;
}

/** Параметры сборки запроса списка. */
export interface ListQueryParams<F extends ListFilters = ListFilters> {
  page: number;
  pageSize: number;
  qValue?: string;
  filters?: F;
}

/** Хелпер: добавить параметр только если значение действительно задано. */
function setIfPresent(params: URLSearchParams, key: string, value: FilterValue) {
  if (value !== "" && value !== null && value !== undefined) {
    params.set(key, String(value));
  }
}

/** Хелпер: исчерпывающее утверждение, что ветка `switch` покрыта. */
function assertNever(x: never, msg = "Unexpected variant"): never {
  throw new Error(`${msg}: ${String(x)}`);
}

/**
 * Сборщик URL для каждого таба с учётом пагинации, поиска и фильтров.
 * Возвращает абсолютный URL к API.
 */
export function buildListUrl(
  tab: TabName,
  { page, pageSize, qValue, filters }: ListQueryParams
): string {
  const offset = Math.max(0, page - 1) * pageSize;
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(offset),
  });

  if (qValue) params.set("q", qValue);

  const f = filters ?? {};
  let path: string;

  switch (tab) {
    case TABS.CHATS: {
      path = "/chats";
      break;
    }
    case TABS.MESSAGES: {
      path = "/messages";
      params.set("table", "1");
      break;
    }
    case TABS.ORDERS: {
      path = "/orders";
      params.set("table", "1");
      setIfPresent(params, "platform", f.platform);
      setIfPresent(params, "order_type", f.order_type);
      setIfPresent(params, "date_from", f.date_from);
      setIfPresent(params, "date_to", f.date_to);
      setIfPresent(params, "min_total", f.min_total);
      setIfPresent(params, "max_total", f.max_total);
      break;
    }
    case TABS.RESERVATIONS: {
      path = "/reserves";
      params.set("table", "1");
      setIfPresent(params, "date_from", f.date_from);
      setIfPresent(params, "date_to", f.date_to);
      setIfPresent(params, "min_guests", f.min_guests);
      setIfPresent(params, "max_guests", f.max_guests);
      break;
    }
    default:
      assertNever(tab);
  }

  return `${API_BASE}${path}?${params.toString()}`;
}

/** Параметры загрузки строк (поддержка AbortSignal для отмены). */
export interface LoadRowsParams<F extends ListFilters = ListFilters>
  extends ListQueryParams<F> {
  signal?: AbortSignal;
}

/** Результат загрузки строк. */
export interface LoadRowsResult<TItem = Record<string, unknown>> {
  items: TItem[];
  total: number;
}

/**
 * Загрузка элементов списка для заданной вкладки.
 * Возвращает массив элементов и общее количество (из заголовка или тела ответа).
 */
export async function loadRows<
  TItem = Record<string, unknown>,
  F extends ListFilters = ListFilters
>(
  tab: TabName,
  { signal, ...rest }: LoadRowsParams<F>
): Promise<LoadRowsResult<TItem>> {
  const url = buildListUrl(tab, rest);

  const response = await fetch(url, {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  // Сервер может вернуть total в заголовке или в самом JSON — поддерживаем обе схемы.
  const data = (await response.json()) as { items?: unknown; total?: number };
  const totalHeader = response.headers.get("X-Total-Count");
  const total = Number(totalHeader ?? data.total ?? 0);

  const items = Array.isArray(data.items) ? (data.items as TItem[]) : [];

  return { items, total };
}

/** Режим сохранения сущности. */
export type SaveMode = "add" | "edit";

/** Опции сохранения/удаления (в т.ч. отмена запроса). */
export interface SaveOptions {
  signal?: AbortSignal;
}

/** Базовая форма полезной нагрузки для сущностей. */
export interface RowPayload extends Record<string, unknown> {
  id?: number | string;
  chat_id?: number | string;
}

/**
 * Сохранение строки. В зависимости от вкладки формируется соответствующий эндпоинт.
 * Возвращает `void`, так как UI часто перезагружает список после успешного запроса.
 * Если нужен body из ответа — несложно расширить контракт до возврата данных.
 */
export async function saveRow(
  tab: TabName,
  mode: SaveMode,
  form: RowPayload,
  body: RowPayload,
  { signal }: SaveOptions = {}
): Promise<void> {
  const method: "POST" | "PUT" = mode === "add" ? "POST" : "PUT";
  let url: string;

  switch (tab) {
    case TABS.CHATS: {
      const chatId = body.chat_id;
      url = mode === "add" ? `${API_BASE}/chats` : `${API_BASE}/chats/${chatId}`;
      break;
    }
    case TABS.MESSAGES: {
      url =
        mode === "add"
          ? `${API_BASE}/messages-raw`
          : `${API_BASE}/messages/${form.id}`;
      break;
    }
    case TABS.ORDERS: {
      url =
        mode === "add"
          ? `${API_BASE}/orders`
          : `${API_BASE}/orders/${form.id}`;
      break;
    }
    case TABS.RESERVATIONS: {
      url =
        mode === "add"
          ? `${API_BASE}/reserves`
          : `${API_BASE}/reserves/${form.id}`;
      break;
    }
    default:
      assertNever(tab);
  }

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Save error (${response.status}): ${text || response.statusText}`);
  }
}

/**
 * Удаление строки. Эндпоинт подбирается по вкладке.
 * Ошибка содержит HTTP-статус и текст ответа для ускорения диагностики.
 */
export async function deleteRow(
  tab: TabName,
  row: RowPayload,
  { signal }: SaveOptions = {}
): Promise<void> {
  let url: string;

  switch (tab) {
    case TABS.CHATS:
      url = `${API_BASE}/chats/${row.chat_id}`;
      break;
    case TABS.MESSAGES:
      url = `${API_BASE}/messages/${row.id}`;
      break;
    case TABS.ORDERS:
      url = `${API_BASE}/orders/${row.id}`;
      break;
    case TABS.RESERVATIONS:
      url = `${API_BASE}/reserves/${row.id}`;
      break;
    default:
      assertNever(tab);
  }

  const response = await fetch(url, { method: "DELETE", signal });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Delete error (${response.status}): ${text || response.statusText}`);
  }
}
