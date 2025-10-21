/**
 * Страница управления данными (чаты / сообщения / заказы / бронирования).
 *
 * Зачем этот файл:
 * - Отображает табличные/мобильные представления данных с пагинацией, фильтрами и поиском.
 * - Дает возможность создавать/редактировать/удалять записи через модальное окно-редактор.
 * - Унифицирует конфигурации колонок для разных вкладок (табов) и их рендер.
 *
 * На что обратить внимание (под стандарты 2025):
 * - Типизация: сведена к структурной, без `any` в публичных местах. Для внешних API/хуков,
 *   где типы неизвестны, использованы минимально необходимые интерфейсы и "узкие" приведения.
 * - Работа с эффектами и коллбэками: обернули обработчики в useCallback, зависимости useMemo
 *   корректно заданы, чтобы не перерендеривать тяжелые участки без надобности.
 * - Универсальная адаптивность: переключатель размера SegmentedToggle зависит от ширины экрана,
 *   вычисляется безопасно (без SSR-ошибок).
 * - Доступность (A11y): у интерактивных элементов есть aria-* атрибуты, ролями размечены панели.
 * - Безопасная работа с `window`: используем `globalThis`-проверку. Прямой "жёсткий" перезагрузки
 *   избегаем, но оставляем как бэкап (если у хука нет метода refetch). Такой подход снижает
 *   риск гонок в SPA и упрощает изоляцию побочных эффектов.
 *
 * Подсказки будущему читателю:
 * - `columns` строятся из активного таба; для неочевидных полей используется `render`.
 * - Валидация платформ задаёт whitelisting через `ALLOWED_PLATFORMS`, чтобы избежать тихих ошибок.
 * - Формы редактирования заполняются по схеме `SCHEMAS[td.tab]`; поля с `readOnly` не отправляем.
 * - Если вы добавляете новые табы или поля — обновите `TAB_TITLES`, `SCHEMAS` и соответствующую
 *   ветку в `columns`. Для сложного форматирования используйте `render` на колонке, чтобы логика
 *   отображения не утекала в таблицу/карточки.
 */

import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import Button, { SegmentedToggle } from "@/components/Button";

import { TAB_TITLES, schema as SCHEMAS, type FieldSchema } from "./config/constants";
import { fmtDate } from "./utils/format";
import { isPlaceholderId, makePlaceholderId } from "./utils/placeholders";

import Badge from "./components/Badge";
import Toolbar, { type SearchState } from "./components/Toolbar";
import FilterBar, { type DatabaseFilterState } from "./components/FilterBar";
import MobileCards from "./components/MobileCards";
import EditorModal from "./components/EditorModal";

import { saveRow as apiSaveRow, deleteRow as apiDeleteRow } from "./api/databaseApi";
import useTableData from "./hooks/useTableData";

// ---- Типы доменной модели (минимально необходимые для тип-безопасности) ----

type EditorMode = "add" | "edit";
type Platform = "telegram" | "vk";
const ALLOWED_PLATFORMS = ["telegram", "vk"] as const satisfies Readonly<Platform[]>;

type Tab = keyof typeof TAB_TITLES;

// Поле схемы, т.к. точные типы схем неизвестны, используем "узкую" структуру.
// Базовый ряд в таблице: динамичный набор ключей, но строковые ключи гарантированы.
type RowData = Record<string, unknown> & {
  id?: string | number;
  chat_id?: number | string;
};

type FormValue = string | number | boolean | null;
type FormState = Record<string, FormValue>;

const coerceInitialFormValue = (field: FieldSchema, raw: unknown): FormValue => {
  if (field.type === "checkbox") {
    return Boolean(raw);
  }

  if (field.type === "number") {
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }

    if (typeof raw === "number") {
      return Number.isFinite(raw) ? raw : null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (raw === null || raw === undefined) {
    return "";
  }

  if (typeof raw === "string") {
    return raw;
  }

  if (typeof raw === "number" || typeof raw === "boolean") {
    return raw;
  }

  return String(raw);
};

// Узкий интерфейс для нашего хука таблицы. Если реальный хук богаче — эти поля сохранятся.
interface TableDataHook {
  tab: Tab;
  tabs: readonly Tab[];
  rows: RowData[];
  total: number;
  loading: boolean;

  // Поиск
  q: SearchState;
  setQ: Dispatch<SetStateAction<SearchState>>;

  // Пагинация
  page: number;
  pages: number;
  pageSize: number;
  setPage: Dispatch<SetStateAction<number>>;
  setPageSize: Dispatch<SetStateAction<number>>;

  // Фильтры
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  filtersDraft: DatabaseFilterState;
  setFiltersDraft: Dispatch<SetStateAction<DatabaseFilterState>>;
  applyFilters: () => void;
  resetFilters: () => void;

  // Навигация по табам
  switchTab: (t: Tab) => void;

  // Опционально: если в хуке есть refetch — используем его вместо "жёсткой" перезагрузки.
  refetch?: () => Promise<void> | void;
}

// Описание колонки с дженериком по типу строки.
type Column<T extends RowData = RowData> = {
  key: keyof T & string;
  title: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
};

export default function DatabasePage() {
  // Приводим к нашему узкому интерфейсу.
  const td = useTableData("chats") as unknown as TableDataHook;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("add");
  const [form, setForm] = useState<FormState>({});

  // UX: компактный режим для очень узких экранов.
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < 443;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsCompact(window.innerWidth < 443);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Конфигурация колонок зависит от активного таба.
  const columns: Column[] = useMemo(() => {
    switch (td.tab) {
      case "chats":
        return [
          {
            key: "chat_id",
            title: "ID чата",
            render: (v) => (isPlaceholderId(v) ? "—" : (v as ReactNode)),
          },
          { key: "username", title: "Юзернейм" },
          { key: "first_name", title: "Имя" },
          { key: "last_name", title: "Фамилия" },
          {
            key: "platform",
            title: "Платформа",
            render: (v) => <Badge>{(v as ReactNode) || "—"}</Badge>,
          },
        ] satisfies Column[];
      case "messages":
        return [
          { key: "chat_id", title: "ID чата" },
          { key: "username", title: "Юзернейм" },
          {
            key: "from_me",
            title: "Отправитель",
            render: (v) => <Badge>{v ? "Оператор" : "Клиент"}</Badge>,
          },
          { key: "text", title: "Сообщение" },
          {
            key: "date",
            title: "Дата и время",
            render: (v) =>
              fmtDate(
                v as Date | string | number | null | undefined,
                { includeTime: true }
              ),
          },
        ] satisfies Column[];
      case "orders":
        return [
          { key: "tg_username", title: "TG юзернейм" },
          { key: "name", title: "Имя" },
          { key: "phone", title: "Телефон" },
          { key: "order_type", title: "Тип заказа" },
          {
            key: "date",
            title: "Дата",
            render: (v) =>
              fmtDate(
                v as Date | string | number | null | undefined
              ),
          },
          { key: "time", title: "Время" },
          { key: "total", title: "Сумма" },
          {
            key: "platform",
            title: "Платформа",
            render: (v) => <Badge>{(v as ReactNode) || "—"}</Badge>,
          },
          {
            key: "created_at",
            title: "Создано",
            render: (v) =>
              fmtDate(
                v as Date | string | number | null | undefined,
                { includeTime: true }
              ),
          },
        ] satisfies Column[];
      default:
        // "reservations" (и иные табы по умолчанию)
        return [
          { key: "tg_username", title: "TG юзернейм" },
          { key: "name", title: "Имя" },
          { key: "phone", title: "Телефон" },
          { key: "address", title: "Адрес" },
          {
            key: "date",
            title: "Дата",
            render: (v) =>
              fmtDate(
                v as Date | string | number | null | undefined
              ),
          },
          { key: "time", title: "Время" },
          { key: "guests", title: "Гостей" },
          {
            key: "platform",
            title: "Платформа",
            render: (v) => <Badge>{(v as ReactNode) || "—"}</Badge>,
          },
          {
            key: "created_at",
            title: "Создано",
            render: (v) =>
              fmtDate(
                v as Date | string | number | null | undefined,
                { includeTime: true }
              ),
          },
        ] satisfies Column[];
    }
  }, [td.tab]);

  // Универсальная "мягкая" перезагрузка данных.
  const refresh = useCallback(async () => {
    if (typeof td.refetch === "function") {
      await td.refetch();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.replace(window.location.href);
    }
  }, [td]);

  const openEditor = useCallback(
    (mode: EditorMode, row: RowData | null = null) => {
      setEditorMode(mode);

      // Инициализацию формы делаем строго по схеме активного таба.
      const shape = SCHEMAS[td.tab] as readonly FieldSchema[];
      const clean: Partial<FormState> = {};
      for (const field of shape) {
        clean[field.key] = coerceInitialFormValue(field, row?.[field.key]);
      }

      setForm(clean as FormState);
      setEditorOpen(true);
    },
    [td.tab]
  );

  const saveEditor = useCallback(async (): Promise<void> => {
    const body: Record<string, unknown> = { ...form };

    if (td.tab === "chats") {
      const raw = String(body.chat_id ?? "").trim();
      if (raw === "" || raw === "-") {
        body.chat_id = makePlaceholderId();
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          alert("ID чата должен быть числом или оставьте «—»");
          return;
        }
        body.chat_id = n;
      }
    } else {
      const fields = SCHEMAS[td.tab] as readonly FieldSchema[];
      for (const f of fields) {
        if (f.readOnly) {
          delete body[f.key];
          continue;
        }
        if (f.type === "number" && body[f.key] !== "") {
          body[f.key] = Number(body[f.key]);
        } else if (f.type === "checkbox") {
          body[f.key] = !!body[f.key];
        }
      }
    }

    if (td.tab === "orders" || td.tab === "reservations") {
      const platform = body.platform as Platform | undefined;
      if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
        alert("Выберите платформу: telegram или vk");
        return;
      }
    }

    try {
      await apiSaveRow(td.tab, editorMode, form, body);
      setEditorOpen(false);
      await refresh();
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message || "Save error";
      alert(message);
    }
  }, [editorMode, form, refresh, td.tab]);

  const deleteRow = useCallback(
    async (row: RowData): Promise<void> => {
      // UX-примечание: confirm сохраняем для простоты. Для продакшна можно заменить на модалку.
      if (!confirm("Удалить запись?")) return;
      try {
        await apiDeleteRow(td.tab, row);
        await refresh();
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : (e as { message?: string })?.message || "Delete error";
        alert(message);
      }
    },
    [refresh, td.tab]
  );

  const onSubmitSearch = useCallback(() => {
    td.setPage(1);
    td.setQ({ ...td.q, value: td.q.input.trim() });
  }, [td]);

  const onClearSearch = useCallback(() => {
    td.setQ({ input: "", value: "" });
    td.setPage(1);
  }, [td]);

  return (
    <div className="px-2 pb-4 pt-12 lg:p-8 max-w-7xl mx-auto space-y-4">
      {/* Переключение табов (адаптивный размер) */}
      <div className="overflow-x-auto" role="tablist" aria-label="Разделы данных">
        <SegmentedToggle
          items={td.tabs.map((t) => ({ value: t, label: TAB_TITLES[t] }))}
          activeValue={td.tab}
          onChange={(value) => td.switchTab(value as Tab)}
          size={isCompact ? "sm" : "md"}
          className="max-[442px]:w-full"
        />
      </div>

      {/* Поиск / счетчики / состояние загрузки */}
      <Toolbar
        q={td.q}
        setQ={td.setQ}
        onSearch={onSubmitSearch}
        onClear={onClearSearch}
        total={td.total}
        loading={td.loading}
      />

      {/* Кнопка показа фильтров на мобильных для некоторых табов */}
      {["orders", "reservations"].includes(td.tab) && (
        <div className="md:hidden">
          <button
            onClick={() => td.setFiltersOpen((v) => !v)}
            className="w-full rounded-xl px-3 py-2 bg-black/20 backdrop-blur-xl text-white"
            type="button"
            aria-expanded={td.filtersOpen}
            aria-controls="filters-panel"
          >
            {td.filtersOpen ? "Скрыть фильтры" : "Показать фильтры"}
          </button>
        </div>
      )}

      {/* Панель фильтров */}
      <FilterBar
        tab={td.tab}
        filters={td.filtersDraft}
        setFilters={td.setFiltersDraft}
        onApply={td.applyFilters}
        onReset={td.resetFilters}
        mobileOpen={td.filtersOpen}
      />

      {/* Создание записи */}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => openEditor("add")}
          variant="primary"
          size="sm"
          className="w-full md:w-auto px-4"
          aria-label="Добавить новую запись"
        >
        Добавить
        </Button>
      </div>

      {/* Мобильные карточки */}
      <div
        className="md:hidden"
        id={`panel-${td.tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${td.tab}`}
      >
        <MobileCards
          rows={td.rows}
          columns={columns}
          tab={td.tab}
          onEdit={(r: RowData) => openEditor("edit", r)}
          onDelete={deleteRow}
          page={td.page}
          pageSize={td.pageSize}
          loading={td.loading}
        />
      </div>

      {/* Таблица для десктопа */}
      <div className="hidden md:block rounded-xl bg-surface">
        <table className="w-full table-fixed text-body z-10">
          <thead className="bg-[#0f1b44]/70 text-white/70">
            <tr>
              <th className="text-left px-3 py-2 font-semibold min-w-0 whitespace-normal break-words">#</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-3 py-2 font-semibold min-w-0 whitespace-normal break-words"
                  scope="col"
                >
                  {c.title}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-semibold min-w-0 whitespace-normal break-words">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {td.rows.length === 0 && !td.loading ? (
              <tr>
                <td
                  colSpan={1 + columns.length + 1}
                  className="text-center p-[10%] text-white/30"
                >
                  Пусто
                </td>
              </tr>
            ) : (
              td.rows.map((r, idx) => {
                const rowKey = r.id ?? r.chat_id ?? `${td.tab}-${idx}`;
                return (
                  <tr key={String(rowKey)} className="group text-white/50 hover:bg-[#0c173a]">
                    <td className="px-3 py-2 min-w-0 whitespace-normal break-words group-hover:text-[#17e1b1]">
                      {(td.page - 1) * td.pageSize + idx + 1}
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 py-2 min-w-0 whitespace-normal break-words group-hover:text-[#17e1b1]"
                      >
                        {c.render ? c.render(r[c.key], r) : (r[c.key] ?? "—") as ReactNode}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEditor("edit", r)}
                        className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white mr-1.5 mb-2"
                        type="button"
                        aria-label="Изменить запись"
                      >
                        Изм.
                      </button>
                      <button
                        onClick={() => deleteRow(r)}
                        className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
                        type="button"
                        aria-label="Удалить запись"
                      >
                        Удал.
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Пагинация и размер страницы */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-body text-slate-500">На странице:</span>
          <label className="sr-only" htmlFor="page-size-select">Размер страницы</label>
          <select
            id="page-size-select"
            value={td.pageSize}
            onChange={(e) => {
              td.setPageSize(Number(e.target.value));
              td.setPage(1);
            }}
            className="bg-[#0b1533] border border-slate-700 rounded-xl px-2 py-1 text-slate-100"
          >
            {[25, 50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => td.setPage((p) => Math.max(1, p - 1))}
            disabled={td.page <= 1 || td.loading}
            variant="accent"
            size="sm"
            className="px-4"
            aria-label="Назад"
          >
            Назад
          </Button>
          <span className="text-body text-slate-500" aria-live="polite">
            стр. {td.page} / {td.pages}
          </span>
          <Button
            type="button"
            onClick={() => td.setPage((p) => Math.min(td.pages, p + 1))}
            disabled={td.page >= td.pages || td.loading}
            variant="accent"
            size="sm"
            className="px-4"
            aria-label="Вперёд"
          >
            Вперёд
          </Button>
        </div>
      </div>

      {/* Модальное окно-редактор */}
      <EditorModal
        open={editorOpen}
        mode={editorMode}
        tab={td.tab}
        schema={SCHEMAS[td.tab]}
        form={form}
        setForm={setForm}
        onClose={() => setEditorOpen(false)}
        onSave={saveEditor}
      />
    </div>
  );
}
