/**
 * Страница рассылки кампании.
 *
 * Что делает:
 * — Собирает контент сообщения (заголовок, текст, изображение) и параметры доставки.
 * — Управляет выбором платформ (tg/vk), фильтрами аудитории и режимами отправки.
 * — Загружает получателей и инициирует рассылку, показывая прогресс выполнения.
 *
 * Почему так:
 * — Локальное состояние разбито по осмысленным блокам (контент, параметры, получатели), чтобы
 *   проще было поддерживать и переиспользовать части в изоляции.
 * — Для производительности и предсказуемости пропсов в 2025-м:
 *   • вычисления (canSend, enabledPlatforms) мемоизируются через useMemo;
 *   • обработчики событий стабилизированы через useCallback — это уменьшает лишние рендеры дочерних компонентов.
 * — Для типов по умолчанию применён оператор `satisfies` — он гарантирует полноту и корректность структуры,
 *   но не «запекает» типы значений (остаются редактируемыми и не становятся литеральными).
 *
 * На что обратить внимание:
 * — Выбор получателей хранится в `Set<string>`: это даёт амортизированную O(1) вставку/удаление и отсутствие дублей.
 *   При любом обновлении используем функциональный сеттер `setSelectedIds(prev => new Set(prev))`,
 *   чтобы не мутировать предыдущее значение (иначе React может пропустить обновление).
 * — Ручной ввод ID: парсим через `parseManualIds`, затем явно приводим к строкам — API отправки ожидает строковые ID.
 * — Режим `limit`: число приводим к `number`, пустые/некорректные значения превращаем в `null` — это явный сигнал «без лимита».
 * — Список включённых платформ рассчитывается один раз (мемо), а не «на лету» при отправке — это избегает гонок и лишних вычислений.
 */

import { useMemo, useState, useCallback } from "react";
import MessageForm from "./components/MessageForm";
import FiltersCard from "./components/FiltersCard";
import ModeCard from "./components/ModeCard";
import RecipientsCard from "./components/RecipientsCard";
import ProgressCard from "./components/ProgressCard";
import { useRecipients } from "./hooks/useRecipients";
import { useBroadcast } from "./hooks/useBroadcast";
import { parseManualIds, canSend as canSendUtil } from "./utils";
import type {
  MailingFilters,
  PlatformKey,
  PlatformState,
  SendMode,
} from "./types";

/** Значения по умолчанию — с проверкой структуры через `satisfies` (TS 4.9+). */
const DEFAULT_PLATFORMS = { tg: true, vk: false } satisfies PlatformState;

const DEFAULT_FILTERS = {
  onlyActiveDays: 90,
  minOrders: 0,
  platform: "any",
} satisfies MailingFilters;

export default function MailingPage() {
  /** Контент сообщения. */
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  /** Параметры рассылки. */
  const [platforms, setPlatforms] = useState<PlatformState>(DEFAULT_PLATFORMS);
  const [filters, setFilters] = useState<MailingFilters>(DEFAULT_FILTERS);
  const [testMode, setTestMode] = useState(true);
  const [sendMode, setSendMode] = useState<SendMode>("all");
  const [limit, setLimit] = useState<number>(50);

  /** Получатели и отправка. */
  const { recipients, loadingRecipients, loadError, loadRecipients } = useRecipients();
  const { isSending, progress, handleSend } = useBroadcast();

  /**
   * Выбор получателей.
   * Храним в Set для быстрого add/delete и устранения дублей.
   */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [manualIdsText, setManualIdsText] = useState("");

  /** Можно ли показывать активный CTA «Отправить». */
  const canSend = useMemo(
    () =>
      canSendUtil({
        text,
        platforms,
        sendMode,
        selectedIds,
      }),
    [text, platforms, sendMode, selectedIds],
  );

  /** Список включённых платформ (tg/vk) в виде массива ключей. */
  const enabledPlatforms = useMemo<PlatformKey[]>(
    () =>
      (Object.entries(platforms) as Array<[PlatformKey, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    [platforms],
  );

  /** Тоггл одного ID в Set — иммутабельно, с пересозданием экземпляра. */
  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  /** Полная очистка выбора — создаём новый Set, а не чистим существующий. */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /**
   * Парс ручных ID (из textarea).
   * Если парсер вернул пусто — ничего не делаем; иначе добавляем и переключаемся в режим "selected".
   */
  const addManualIds = useCallback(() => {
    const ids = parseManualIds(manualIdsText);
    if (!ids.length) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(value => next.add(String(value)));
      return next;
    });
    setSendMode("selected");
  }, [manualIdsText]);

  /** Явная загрузка получателей под текущие фильтры/платформы. */
  const onLoadRecipients = useCallback(async () => {
    await loadRecipients({ platformsObj: platforms, filters, limit: 500 });
  }, [loadRecipients, platforms, filters]);

  /**
   * Отправка.
   * Гарантируем:
   * — Не отправляем, если уже идёт отправка или CTA неактивен.
   * — Корректно формируем полезную нагрузку по режиму (limit/selected).
   */
  const onSend = useCallback(async () => {
    if (!canSend || isSending) return;

    await handleSend({
      title: title || "Без названия",
      text,
      imageUrl: imageUrl || null,
      platforms: enabledPlatforms,
      filters,
      testMode,
      mode: sendMode,
      limit: sendMode === "limit" ? (Number.isFinite(+limit) ? Number(limit) : null) : null,
      recipientIds: sendMode === "selected" ? Array.from(selectedIds) : [],
    });
  }, [
    canSend,
    isSending,
    handleSend,
    title,
    text,
    imageUrl,
    enabledPlatforms,
    filters,
    testMode,
    sendMode,
    limit,
    selectedIds,
  ]);

  return (
    <div className="pb-6 pt-12 flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Блок контента сообщения: заголовок/текст/изображение. */}
        <MessageForm
          title={title}
          setTitle={setTitle}
          text={text}
          setText={setText}
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
        />

        <div className="flex flex-col gap-4">
          {/* Фильтры аудитории и параметры отправки. */}
          <FiltersCard
            platforms={platforms}
            setPlatforms={setPlatforms}
            filters={filters}
            setFilters={setFilters}
            limit={limit}
            setLimit={setLimit}
            sendMode={sendMode}
          />

          {/* Режимы отправки + CTA: тестовый/боевой, загрузка получателей, отправка. */}
          <ModeCard
            sendMode={sendMode}
            setSendMode={setSendMode}
            testMode={testMode}
            setTestMode={setTestMode}
            canSend={canSend}
            onSend={onSend}
            onLoad={onLoadRecipients}
            loadingRecipients={loadingRecipients}
            isSending={isSending}
          />

          {/* Пользовательская ошибка загрузки (если была). */}
          {loadError && <div className="text-body text-red-400">{loadError}</div>}
        </div>

        {/* Работа со списком получателей: автозагрузка, ручные ID, выбор/снятие. */}
        <RecipientsCard
          sendMode={sendMode}
          recipients={recipients}
          manualIdsText={manualIdsText}
          setManualIdsText={setManualIdsText}
          addManualIds={addManualIds}
          selectedIds={selectedIds}
          toggleOne={toggleOne}
          clearSelection={clearSelection}
        />
      </div>

      {/* Индикатор прогресса рассылки. */}
      <ProgressCard progress={progress} />
    </div>
  );
}
