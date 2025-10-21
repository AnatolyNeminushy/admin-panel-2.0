/**
 * Страница со списком чатов и областью сообщений.
 *
 * Зачем это нужно:
 * - Слева показываем каталожный список диалогов с локальным поиском и «псевдо-пагинацией» по пресетам.
 * - Справа — активный чат и лента сообщений с отправкой.
 *
 * На что обратить внимание:
 * - Аккуратная работа с AbortController в fetch, чтобы не гонять лишние запросы и не ловить race conditions.
 * - Нормализация ID при сравнениях (строка/число) — это частая точка боли при данных из разных источников.
 * - Мемоизации/колбэки завязаны на зависимости (чтобы избежать «дрожащих» перерендеров).
 * - Типы описаны максимально «узко», но без преждевременной строгости — внешние компоненты/бэкенд могут меняться.
 *
 * Подсказки будущему читателю:
 * - API может вернуть список диалогов как массив или обёртку `{ items, total }`. Код обрабатывает оба кейса.
 * - «Показать N» реализовано через client-side slice: сервер сейчас отдаёт крупный лимит (TODO: перейти на серверную пагинацию).
 * - alert(...) оставлен умышленно как «минимально достаточный» UX. Для продакшена подменить на ваш toast/snackbar.
 */

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactElement,
} from "react";

import SearchBar from "../../components/SearchBar";
import ChatList from "./components/ChatList";
import MessagePane from "./components/MessagePane";
import { getDialogTimestamp, matchesLocal } from "./utils/chatUtils";
import { RangePresets } from "@/components/Button";

// Универсальный тип идентификатора — иногда приходит числом, иногда строкой.
type ID = string | number;

/** Базовая форма диалога. Доп.поля не фиксируем — бэкенд может расширяться. */
interface Dialog {
  chat_id: ID;
  [key: string]: unknown;
}

/** Возможные формы ответа для списка диалогов. */
interface ApiDialogsArray {
  items?: Dialog[];
  total?: number;
  count?: number;
  totalCount?: number;
  [key: string]: unknown;
}

/** Сообщение в ленте. Поля начинаются как минимально необходимые. */
interface Message {
  id: ID;
  chat_id: ID;
  from_me?: boolean;
  text?: string;
  date?: string;
  is_bot?: boolean;
  _pending?: boolean;
  _clientOrder: number; // локальный порядок (число), чтобы не дёргать сортировку на каждое обновление
  [key: string]: unknown;
}

/** Хелперы — выносим повторяющиеся конструкции. */

/** Сравнение ID без ловушек «1» vs 1. */
const idEq = (a: ID | null | undefined, b: ID | null | undefined): boolean =>
  String(a ?? "") === String(b ?? "");

/** Безопасно приводим возможно-undefined число. */
const toPositiveNumber = (n: unknown): number =>
  Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0;

/** Ничего не делающий callback — понятнее, чем пустая стрелка inline. */
const noop = () => {};

/** Главный компонент страницы. */
export default function ChatsPage(): ReactElement {
  // --- Состояния представления и данных
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [selectedId, setSelectedId] = useState<ID | null>(null);

  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [totalCount, setTotalCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState<number>(50);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // В продакшене удобнее, когда отсутствие переменной окружения — явная ошибка.
  // Здесь мягко дефолтимся в пустую строку, но в бою лучше кинуть invariant/ошибку и показать заглушку.
  const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

  // --- Медиа-квери: адаптивная раскладка
  const [isMdUp, setIsMdUp] = useState<boolean>(
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : true // SSR: safe default
  );

  useEffect(() => {
    // Современный способ подписки на изменения media query
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsMdUp(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // --- Производные коллекции диалогов
  const sortedDialogs = useMemo(
    () => [...dialogs].sort((a, b) => getDialogTimestamp(b) - getDialogTimestamp(a)),
    [dialogs]
  );

  const locallyFiltered = useMemo(
    () => sortedDialogs.filter((d) => matchesLocal(d, searchInput)),
    [sortedDialogs, searchInput]
  );

  const displayedDialogs = useMemo(() => {
    // Мини-пагинация на клиенте. Если totalCount < пресета, не уходим за лимит.
    const count = Math.min(
      typeof visibleCount === "number" ? visibleCount : totalCount,
      locallyFiltered.length
    );
    return locallyFiltered.slice(0, count);
  }, [locallyFiltered, visibleCount, totalCount]);

  // Выбранный диалог — вычисляем по selectedId (безопасное сравнение ID).
  const selectedDlg = useMemo(
    () => dialogs.find((d) => idEq(d.chat_id, selectedId)) ?? null,
    [dialogs, selectedId]
  );

  // --- Загрузка диалогов
  useEffect(() => {
    if (!API) {
      // Мягкая деградация: без API не грузим.
      setDialogs([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    (async () => {
      setLoading(true);
      try {
        // TODO (улучшение): перейти на серверную пагинацию.
        const res = await fetch(
          `${API}/chats?limit=10000&offset=0&q=${encodeURIComponent(searchQuery)}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          setDialogs([]);
          setTotalCount(0);
          return;
        }

        const totalFromHeader = toPositiveNumber(res.headers.get("X-Total-Count"));
        const data: ApiDialogsArray | Dialog[] = await res.json();

        if (data && !Array.isArray(data) && Array.isArray(data.items)) {
          setDialogs(data.items);

          const metaTotal = toPositiveNumber(
            (data.total ?? data.count ?? data.totalCount) as number | undefined
          );

          const fallbackTotal = data.items.length;

          setTotalCount(
            totalFromHeader > 0
              ? totalFromHeader
              : metaTotal > 0
              ? metaTotal
              : fallbackTotal
          );
        } else if (Array.isArray(data)) {
          setDialogs(data);
          const fallbackTotal = data.length;
          setTotalCount(totalFromHeader > 0 ? totalFromHeader : fallbackTotal);
        } else {
          setDialogs([]);
          setTotalCount(0);
        }
      } catch (e) {
        // Игнорируем AbortError — это нормальное завершение при смене поиска/размонтировании
        if ((e as DOMException).name !== "AbortError") {
          setDialogs([]);
          setTotalCount(0);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [searchQuery, API]);

  // --- Авто-выбор первого диалога на десктопе
  useEffect(() => {
    if (!sortedDialogs.length) return;
    if (!isMdUp) return;
    if (selectedId && sortedDialogs.some((d) => idEq(d.chat_id, selectedId))) return;

    setSelectedId(sortedDialogs[0].chat_id);
  }, [sortedDialogs, selectedId, isMdUp]);

  // --- Загрузка сообщений выбранного диалога
  useEffect(() => {
    if (!selectedId || !API) return;

    const controller = new AbortController();
    setLoadingMessages(true);

    fetch(`${API}/messages?chatId=${encodeURIComponent(String(selectedId))}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json().catch(() => []);
        const arr = Array.isArray(data) ? data : [];

        // Нормализуем минимальный набор полей и вычисляем client-side порядок (_clientOrder).
        return arr.map((m: Record<string, unknown>, idx: number) => {
          const role = String(
            (m.role as string) ||
              (m.sender as string) ||
              (m.author as string) ||
              (m.sender_name as string) ||
              ""
          ).toLowerCase();

          const isBot =
            role === "bot" ||
            role === "assistant" ||
            role === "ai" ||
            role === "irbi" ||
            m.is_bot === true ||
            m.is_bot === 1 ||
            m.is_bot === "1";

          const tsCandidate =
            typeof m.date === "string" && !Number.isNaN(Date.parse(m.date))
              ? Date.parse(m.date)
              : NaN;

          const ts = Number.isFinite(tsCandidate) ? (tsCandidate as number) : idx;

          return { ...m, is_bot: isBot, _clientOrder: ts } as Message;
        });
      })
      .then((mapped) => setMessages(Array.isArray(mapped) ? (mapped as Message[]) : []))
      .catch((e) => {
        if ((e as DOMException).name !== "AbortError") setMessages([]);
      })
      .finally(() => setLoadingMessages(false));

    return () => controller.abort();
  }, [selectedId, API]);

  // --- Отправка сообщения
  const handleSend = useCallback(
    async (text: string) => {
      if (!API) {
        alert("Конфигурация API не задана.");
        return;
      }
      if (!selectedId || !text || !text.trim()) return;

      const now = Date.now();
      const tempId = `tmp-${now}`;
      const payload = text.trim();

      const tempMsg: Message = {
        id: tempId,
        chat_id: selectedId,
        from_me: true,
        text: payload,
        date: new Date(now).toISOString(),
        _pending: true,
        _clientOrder: now,
      };

      // Оптимистично показываем сообщение
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const res = await fetch(`${API}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: selectedId, text: payload }),
        });

        if (!res.ok) {
          // Откатываем оптимистичный апдейт
          setMessages((prev) => prev.filter((m) => !idEq(m.id, tempId)));

          const errBody = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;

          alert((errBody && errBody.error) || "Не удалось отправить сообщение");
          return;
        }

        const data = (await res.json().catch(() => null)) as Partial<Message> | null;

        if (!data) {
          setMessages((prev) => prev.filter((m) => !idEq(m.id, tempId)));
          alert("Не удалось отправить сообщение");
          return;
        }

        // Сливаем серверный ответ в оптимистичное сообщение
        setMessages((prev) =>
          prev.map((m) =>
            idEq(m.id, tempId)
              ? {
                  ...m,
                  id: (data.id as ID) ?? m.id,
                  chat_id: (data.chat_id as ID) ?? m.chat_id,
                  from_me: true,
                  text: (data.text as string) ?? m.text,
                  _pending: false,
                }
              : m
          )
        );
      } catch {
        setMessages((prev) => prev.filter((m) => !idEq(m.id, tempId)));
        alert("Не удалось отправить сообщение (нет соединения).");
      }
    },
    [API, selectedId]
  );

  // --- Пресеты количества отображаемых диалогов
  const presets = useMemo(() => {
    const candidates = [20, 50, 100, 200, 500];
    return candidates
      .filter((n) => n < totalCount)
      .concat([totalCount || 0])
      .filter(Boolean) as number[];
  }, [totalCount]);

  const presetItems = useMemo(
    () =>
      presets.map((n) => ({
        key: String(n),
        label: n === totalCount ? `Все (${totalCount})` : n,
      })),
    [presets, totalCount]
  );

  // --- Колбэки выбора/возврата
  const handleSelectChat = useCallback((id: ID) => setSelectedId(id), []);
  const handleBackToChats = useCallback(() => setSelectedId(null), []);

  // --- Счётчики витрины
  const shownCount = displayedDialogs.length;
  const filteredCount = locallyFiltered.length;

  return (
    <div className="flex h-full relative min-h-0 overflow-hidden md:pt-14 lg:py-8">
      {isMdUp ? (
        // ---------- Desktop layout: двухколоночная раскладка
        <>
          <div
            className="
              hidden md:flex md:flex-col h-full min-h-0 overflow-hidden
              bg-surface
              md:w-[294px] lg:w-[28vw]
              transition-[width] duration-200
            "
          >
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={() => setSearchQuery(searchInput.trim())}
              onClear={() => {
                setSearchInput("");
                setSearchQuery("");
              }}
            />

            <div className="mt-2 text-body text-white/15 ml-5">
              Показано: <span className="font-medium">{shownCount}</span> из{" "}
              <span className="font-medium">{filteredCount}</span>
              {searchInput ? (
                <span className="text-white/50"> (всего: {totalCount})</span>
              ) : null}
            </div>

            <div className="mt-2 flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="pt-4 px-6">
                <div className="flex flex-wrap gap-2 mb-3">
                  <RangePresets
                    items={presetItems}
                    value={String(visibleCount)}
                    buttonSize="sm"
                    onChange={(v: string) => setVisibleCount(Number(v))}
                    className="mb-3"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-fade">
                {loading ? (
                  <div className="p-4 text-center text-white/30">Загрузка...</div>
                ) : (
                  <ChatList
                    dialogs={displayedDialogs}
                    selectedId={selectedId}
                    onSelect={handleSelectChat}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 min-h-0 bg-surface ml-4 lg:ml-8 flex flex-col overflow-hidden">
            <MessagePane
              selectedId={selectedId}
              dlg={selectedDlg}
              messages={messages}
              loading={loadingMessages}
              onSend={handleSend}
              onBack={noop}
            />
          </div>
        </>
      ) : (
        // ---------- Mobile layout: одна колонка с переключением списка/сообщений
        <div className="bg-white/15 backdrop-blur-2xl pt-12 flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="overflow-hidden flex flex-col min-h-0">
                <SearchBar
                  value={searchInput}
                  onChange={setSearchInput}
                  onSubmit={() => setSearchQuery(searchInput.trim())}
                  onClear={() => {
                    setSearchInput("");
                    setSearchQuery("");
                  }}
                />

                <div className="text-body text-white/15 ml-5">
                  Показано: <span className="font-medium">{shownCount}</span> из{" "}
                  <span className="font-medium">{filteredCount}</span>
                  {searchInput ? (
                    <span className="text-white/50"> (всего: {totalCount})</span>
                  ) : null}
                </div>

                <div className="rounded-3xl flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="pt-4 px-6">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <RangePresets
                        items={presetItems}
                        value={String(visibleCount)}
                        buttonSize="sm"
                        onChange={(v: string) => setVisibleCount(Number(v))}
                        className="mb-3"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto scrollbar-fade [-webkit-overflow-scrolling:touch] overscroll-y-contain">
                    {loading ? (
                      <div className="p-4 text-center text-white/30">Загрузка...</div>
                    ) : (
                      <ChatList
                        dialogs={displayedDialogs}
                        selectedId={selectedId}
                        onSelect={handleSelectChat}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col sm:overflow-hidden">
              <MessagePane
                selectedId={selectedId}
                dlg={selectedDlg}
                messages={messages}
                loading={loadingMessages}
                onSend={handleSend}
                onBack={handleBackToChats}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
