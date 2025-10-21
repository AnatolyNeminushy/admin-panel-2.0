/**
 * Конфигурация UI-констант и схем форм для CRUD-вкладок интерфейса.
 *
 * Зачем это нужно:
 * — В одном месте описываем «что и как редактируется» (single source of truth),
 *   чтобы форма строилась декларативно без дублирования.
 * — Схема стабильна на уровне типов: используем `as const` и `satisfies`,
 *   чтобы компилятор строго проверял ключи и варианты значений.
 *
 * Важно для читателя/поддержки:
 * — Поле `key` — это внешний идентификатор, который «знает» бэкенд/БД. Не переименовывайте без миграций.
 * — `type: "date" | "datetime-local"` ожидает ISO-значения, совместимые с HTML `<input type="date|datetime-local">`.
 * — `options` у `select` — иммутабельный список (readonly), чтобы избежать случайной мутации во время рендера.
 * — Объекты и массивы объявлены как иммутабельные (readonly) — это упрощает reasoning в React и помогает избежать багов.
 */

/** Удобная секция для общих доменных литералов. Расширяйте тут, чтобы не дублировать строки внизу. */
export type Platform = "telegram" | "vk";
export const PLATFORM_OPTIONS = ["telegram", "vk"] as const satisfies readonly Platform[];

/**
 * Заголовки вкладок (UI-лейблы).
 * `as const` — чтобы ключи стали литеральными и сформировали строгий union для `TabKey`.
 */
export const TAB_TITLES = {
  chats: "Чаты",
  messages: "Сообщения",
  orders: "Заказы",
  reservations: "Брони",
} as const;

export const TAB_HINTS = {
  chats:
    "ID чата — строка или число из платформы. Платформа выбирается из списка (telegram или vk). Остальные поля принимают обычный текст.",
  messages:
    "ID чата — числовой идентификатор. Дата и время вводятся в формате YYYY-MM-DDTHH:MM. Флажок «От оператора» отмечай, если сообщение отправлено сотрудником.",
  orders:
    "Дата выбирается календарём (формат YYYY-MM-DD), время вводи как HH:MM в 24-часовом формате. Телефон — лучше в формате +7XXXXXXXXXX. Сумму заполняй цифрами без знаков ₽.",
  reservations:
    "Дата выбирается календарём (YYYY-MM-DD), время — HH:MM. Количество гостей — число. Телефон и адрес вводятся текстом, платформу выбери из списка.",
} as const satisfies Record<TabKey, string>;

/** Ключи вкладок выводим из объекта — меньше ручной синхронизации и меньше шансов ошибиться. */
export type TabKey = keyof typeof TAB_TITLES;

/** Разрешённые типы полей формы. Держим список компактным и совместимым с HTML-инпутами. */
export type FieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "checkbox"
  | "date"
  | "datetime-local";

/**
 * Схема одного поля. Оборачиваем в Readonly, чтобы явно запрещать мутацию конфигурации в рантайме.
 * Подсказка: если вам нужно вычисляемо менять конфиг — создавайте новые объекты (immutability).
 */
export type FieldSchema = Readonly<{
  /** Внешний ключ/колонка. Не меняем без миграций. */
  key: string;
  /** Понятная человеку подпись поля. */
  label: string;
  /** Тип рендера/валидации поля. */
  type: FieldType;
  /** Варианты для select. Только для type="select". */
  options?: readonly string[];
  /** Обязательное ли поле для сохранения. */
  required?: boolean;
  /** Только для чтения (серверное или бизнес-ограничение). */
  readOnly?: boolean;
  /** Подсказка для пользователя, как вводить данные. */
  helper?: string;
}>;

/** Карта вкладка → список полей. Все уровни — readonly, чтобы конфиг был по-настоящему неизменяемым. */
export type TabSchema = Readonly<Record<TabKey, ReadonlyArray<FieldSchema>>>;

/**
 * Схемы полей для CRUD-форм каждой вкладки.
 * Нюансы:
 * — `messages.chat_id` — число: предполагаем, что в БД это numeric FK. В `chats.chat_id` — текст (внешние платформы часто отдают строковые ID).
 * — Даты:
 *    • `date` — без времени (локальная дата).
 *    • `datetime-local` — локальная дата+время (без таймзоны). Храните в БД в ISO/UTC, а в UI конвертируйте явно.
 */
export const schema = {
  /** Вкладка «Чаты»: базовая карточка контакта/диалога. */
  chats: [
    {
      key: "chat_id",
      label: "ID чата",
      type: "text",
      helper: "Введите идентификатор из платформы, например «123456789».",
    },
    {
      key: "username",
      label: "Юзернейм",
      type: "text",
      helper: "Укажите username без символа «@», например «client_support».",
    },
    {
      key: "first_name",
      label: "Имя",
      type: "text",
      helper: "Введите имя собеседника, например «Анна».",
    },
    {
      key: "last_name",
      label: "Фамилия",
      type: "text",
      helper: "Введите фамилию, например «Иванова».",
    },
    {
      key: "platform",
      label: "Платформа",
      type: "select",
      // Подсказка: держим источник правды в PLATFORM_OPTIONS, чтобы не расходились значения.
      options: PLATFORM_OPTIONS,
      helper: "Выберите платформу, откуда пришёл чат (Telegram или VK).",
    },
  ] as const,

  /** Вкладка «Сообщения»: поток сообщений внутри чата. */
  messages: [
    {
      key: "id",
      label: "ID",
      type: "number",
      readOnly: true,
      helper: "Поле только для чтения: идентификатор сообщения присваивается автоматически.",
    },
    {
      key: "chat_id",
      label: "ID чата",
      type: "number",
      required: true,
      helper: "Введите числовой ID чата, например «1024».",
    },
    {
      key: "from_me",
      label: "От оператора",
      type: "checkbox",
      helper: "Отметьте, если сообщение отправили Вы или оператор.",
    },
    {
      key: "text",
      label: "Сообщение",
      type: "textarea",
      required: true,
      helper: "Введите текст сообщения. Вы можете использовать переносы строк.",
    },
    {
      key: "date",
      label: "Дата и время",
      type: "datetime-local",
      helper: "Укажите дату и время в формате YYYY-MM-DDTHH:MM, например «2025-03-18T14:30».",
    },
  ] as const,

  /** Вкладка «Заказы»: быстрая CRM-форма для оформления заказа. */
  orders: [
    {
      key: "id",
      label: "ID",
      type: "number",
      readOnly: true,
      helper: "Поле только для чтения: идентификатор заказа создаётся автоматически.",
    },
    {
      key: "tg_username",
      label: "TG юзернейм",
      type: "text",
      helper: "Введите Telegram username без символа «@», например «client123».",
    },
    {
      key: "name",
      label: "Имя",
      type: "text",
      helper: "Укажите имя клиента, например «Мария».",
    },
    {
      key: "phone",
      label: "Телефон",
      type: "text",
      helper: "Введите номер телефона в международном формате, например «+79991234567».",
    },
    {
      key: "order_type",
      label: "Тип заказа",
      type: "text",
      helper: "Опишите тип заказа, например «Доставка» или «Самовывоз».",
    },
    {
      key: "date",
      label: "Дата",
      type: "date",
      helper: "Выберите дату заказа — календарь сохранит формат YYYY-MM-DD.",
    },
    {
      key: "time",
      label: "Время",
      type: "text",
      helper: "Введите время в 24-часовом формате, например «18:30».",
    },
    {
      key: "address",
      label: "Адрес",
      type: "text",
      helper: "Укажите адрес доставки, например «Москва, ул. Ленина, д. 10».",
    },
    {
      key: "items",
      label: "Состав заказа",
      type: "textarea",
      helper: "Перечислите позиции заказа — по одной на строку.",
    },
    {
      key: "total",
      label: "Сумма",
      type: "number",
      helper: "Введите итоговую сумму цифрами, например «3500».",
    },
    {
      key: "comment",
      label: "Комментарий",
      type: "textarea",
      helper: "Добавьте заметку для менеджеров. Поле можно оставить пустым.",
    },
    {
      key: "platform",
      label: "Платформа",
      type: "select",
      options: PLATFORM_OPTIONS,
      required: true,
      helper: "Выберите платформу, с которой поступил заказ.",
    },
  ] as const,

  /** Вкладка «Брони»: бронирование столов/слотов. */
  reservations: [
    {
      key: "id",
      label: "ID",
      type: "number",
      readOnly: true,
      helper: "Поле только для чтения: идентификатор брони формируется автоматически.",
    },
    {
      key: "tg_username",
      label: "TG юзернейм",
      type: "text",
      helper: "Введите Telegram username гостя без «@», например «guest2025».",
    },
    {
      key: "name",
      label: "Имя",
      type: "text",
      helper: "Укажите имя гостя, например «Сергей».",
    },
    {
      key: "phone",
      label: "Телефон",
      type: "text",
      helper: "Введите телефон в формате «+79991234567».",
    },
    {
      key: "address",
      label: "Адрес",
      type: "text",
      helper: "Укажите адрес заведения или площадки, например «СПб, Невский пр. 15».",
    },
    {
      key: "date",
      label: "Дата",
      type: "date",
      helper: "Выберите дату бронирования — календарь сохранит формат YYYY-MM-DD.",
    },
    {
      key: "time",
      label: "Время",
      type: "text",
      helper: "Введите время начала в формате «HH:MM», например «19:00».",
    },
    {
      key: "guests",
      label: "Гостей",
      type: "number",
      helper: "Укажите количество гостей цифрами, например «4».",
    },
    {
      key: "comment",
      label: "Комментарий",
      type: "textarea",
      helper: "Добавьте пожелания гостя. Поле можно оставить пустым.",
    },
    {
      key: "platform",
      label: "Платформа",
      type: "select",
      options: PLATFORM_OPTIONS,
      required: true,
      helper: "Выберите платформу, через которую пришла бронь.",
    },
  ] as const,
} as const satisfies TabSchema;
