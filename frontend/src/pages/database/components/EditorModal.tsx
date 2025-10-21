/**
 * Модальное окно добавления/редактирования универсальных сущностей.
 *
 * Зачем это нужно:
 * - Один компонент обслуживает разные вкладки (таблицы) — поля описываются схемой `schema`.
 * - Формы контролируемые: все значения живут в `form`, изменения проводим через `setForm`.
 * - Компонент доступен: корректные aria-атрибуты, закрытие по клику на фон и по Escape.
 *
 * Как устроено:
 * - `schema` — массив полей: { key, label, type, required?, readOnly?, options? }.
 * - В зависимости от `type` рендерим input/textarea/checkbox/select.
 * - Для readOnly в режиме редактирования используем **readOnly** (а не disabled) там, где это уместно
 *   — так поле остаётся фокусируемым и его можно скопировать (лучше для доступности).
 * - Для числовых инпутов аккуратно парсим значение: пустая строка → `null`, иначе `Number(...)`.
 *
 * Нюансы:
 * - Обработчик клика по подложке (backdrop) закрывает модалку **только** при клике именно по подложке,
 *   а не по любому внутреннему элементу (сравниваем `event.target` и `event.currentTarget`).
 * - Закрытие по Escape вешаем/снимаем в `useEffect` при монтировании/размонтировании модалки.
 * - Для типов `email`, `url`, `tel`, `number` выставляем подходящие `autoComplete` и `inputMode`
 *   — мелочь, но помогает мобильным пользователям и улучшает UX.
 */

import { useEffect, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import Button from "@/components/Button";
import DateField from "@/components/DateField";
import { TAB_TITLES } from "../config/constants";

type Mode = "add" | "edit";
type Tab = keyof typeof TAB_TITLES;

type FieldType =
  | "text"
  | "number"
  | "email"
  | "password"
  | "date"
  | "datetime-local"
  | "time"
  | "textarea"
  | "checkbox"
  | "select"
  | "url"
  | "tel";

type FormValue = string | number | boolean | null;
type FormState = Record<string, FormValue>;

interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  options?: readonly string[]; // для select
}

interface EditorModalProps {
  open: boolean;
  mode: Mode;
  tab: Tab;
  schema: readonly SchemaField[];
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onClose: () => void;
  onSave: () => void;
}

export default function EditorModal({
  open,
  mode,
  tab,
  schema,
  form,
  setForm,
  onClose,
  onSave,
}: EditorModalProps) {
  if (!open) return null;

  const headingId = "editor-modal-heading";

  // Закрытие по Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Блокируем прокрутку страницы, пока открыта модалка
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Расширяем UX под мобильные клавиатуры и автозаполнение
  const getInputMeta = (type: FieldType) => {
    switch (type) {
      case "email":
        return { autoComplete: "email" as const, inputMode: "email" as const };
      case "url":
        return { autoComplete: "url" as const, inputMode: "url" as const };
      case "tel":
        return { autoComplete: "tel" as const, inputMode: "tel" as const };
      case "number":
        return { inputMode: "numeric" as const };
      case "password":
        return { autoComplete: "new-password" as const };
      case "date":
      case "time":
      case "datetime-local":
      default:
        return {};
    }
  };

  const getFieldFormatHint = (field: SchemaField): string => {
    switch (field.type) {
      case "email":
        return "Формат: имя@домен, например user@example.com.";
      case "url":
        return "Формат: полная ссылка, например https://example.com.";
      case "tel":
        return "Формат: международный номер, например +7 999 123-45-67.";
      case "number":
        return "Формат: только цифры, например 42.";
      case "password":
        return "Формат: строка с любыми символами; отображается скрыто.";
      case "date":
        return "Формат: дата дд.мм.гггг или выберите в календаре.";
      case "datetime-local":
        return "Формат: ГГГГ-ММ-ДДTЧЧ:ММ, например 2024-05-10T14:30.";
      case "time":
        return "Формат: время ЧЧ:ММ, например 09:45.";
      case "textarea":
        return "Формат: произвольный многострочный текст.";
      case "checkbox":
        return "Отметьте, если значение должно быть активным (true).";
      case "select":
        return field.options && field.options.length
          ? `Выберите вариант из списка: ${field.options.slice(0, 3).join(", ")}${
              field.options.length > 3 ? " ..." : ""
            }.`
          : "Выберите один из доступных вариантов.";
      case "text":
      default:
        return "Формат: текстовое значение (буквы, цифры, символы).";
    }
  };

  // Приводим значение к корректному типу перед записью в form
  const coerceValue = (type: FieldType, raw: string): FormValue => {
    if (type === "number") return raw.trim() === "" ? null : Number(raw);
    // Для текстовых/дата-временных значений храним строку (в т.ч. пустую)
    return raw;
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const baseInputCls = "rounded-xl bg-[#09102a] px-3 py-2 focus:outline-none ";
  const hintCls = "text-xs text-white/30 leading-snug";

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-[#0b1533] rounded-2xl w-full max-w-3xl p-5 flex flex-col gap-4 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id={headingId} className="text-h4 font-medium text-white/50">
            {mode === "add" ? "Добавление" : "Редактирование"}: {TAB_TITLES[tab]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/30"
            aria-label="Закрыть модальное окно"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 text-white/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {schema.map((f) => {
              const isReadOnly = !!f.readOnly && mode === "edit";
              const inputMeta = getInputMeta(f.type);
              const formatHint = getFieldFormatHint(f);

              // Для вложенной разметки label ассоциируется с контролом автоматически (хорошо для доступности)
              if (f.type === "date" && !isReadOnly) {
                return (
                  <div key={f.key} className="flex flex-col gap-1">
                    <DateField
                      name={f.key}
                      label={`${f.label}${f.required ? " *" : ""}`}
                      value={(form[f.key] as string) ?? undefined}
                      required={!!f.required}
                      accentColor="#17E1B1"
                      onChange={(e) =>
                        setForm((state) => ({
                          ...state,
                          [f.key]: e.target.value ?? null,
                        }))
                      }
                    />
                    {formatHint && <span className={hintCls}>{formatHint}</span>}
                  </div>
                );
              }

              return (
                <label
                  key={f.key}
                  className={`${f.type === "textarea" ? "sm:col-span-2" : ""} flex flex-col gap-1`}
                >
                  <span className="text-body">
                    {f.label}
                    {f.required ? " *" : ""}
                  </span>

                  {f.type === "textarea" ? (
                    <textarea
                      {...inputMeta}
                      readOnly={isReadOnly}
                      required={!!f.required}
                      className={`${baseInputCls} min-h-[96px] resize-y`}
                      value={(form[f.key] as string) ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: coerceValue("text", e.target.value) }))
                      }
                    />
                  ) : f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      required={!!f.required}
                      className="h-4 w-4 focus:outline-none"
                      checked={Boolean(form[f.key])}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.checked }))}
                    />
                  ) : f.type === "select" ? (
                    <select
                      disabled={isReadOnly}
                      required={!!f.required}
                      className={baseInputCls}
                      value={(form[f.key] as string) ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: coerceValue("text", e.target.value) }))
                      }
                    >
                      <option value="">— выберите —</option>
                      {f.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...inputMeta}
                      type={f.type}
                      readOnly={isReadOnly}
                      required={!!f.required}
                      className={baseInputCls}
                      value={
                        f.type === "number"
                          ? ((form[f.key] ?? "") as number | string)
                          : (form[f.key] as string) ?? ""
                      }
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: coerceValue(f.type, e.target.value) }))
                      }
                    />
                  )}
                  {formatHint && <span className={hintCls}>{formatHint}</span>}
                </label>
              );
            })}
          </div>

          {tab === "chats" && (
            <div className="rounded-xl bg-[#09102a] border border-slate-700 p-3 text-body text-slate-400">
              <b>Подсказка:</b> если не знаете реальный <b>ID чата</b>, оставьте пустым или введите
              «—». Будет создан временный ID (в таблице отобразится как «—»). Сообщения отправлять
              нельзя, пока не замените на реальный ID.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose} variant="accent" size="sm">
            Отмена
          </Button>
          <Button type="button" onClick={onSave} variant="accent" size="sm">
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}
