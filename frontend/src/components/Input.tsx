import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type ReactElement,
} from "react";

/**
 * Поле ввода с «плавающей» меткой на Tailwind (через peer-хак).
 *
 * Зачем и как это работает:
 * - Сам input получает класс `peer`, а <label> — набор `peer-*` модификаторов.
 * - Когда placeholder НЕ пустой (даже один пробел), состояние `:placeholder-shown`
 *   позволяет метке «проваливаться» вниз при пустом поле и «всплывать» вверх при фокусе/вводе.
 * - Такой подход не требует JS и дружит с доступностью: label связан с input через htmlFor/id.
 *
 * Подсказки для читателя/будущего автора:
 * - Если вы уберёте placeholder совсем, анимация метки отключится — оставьте хотя бы `" "`.
 * - Для управления ошибками передавайте `aria-invalid={true}` (или строковое "true"),
 *   тогда поле подсветится классами варианта `aria-[invalid="true"]:*`.
 * - Компонент отдает ref на <input />, что удобно для фокуса и интеграции с react-hook-form.
 */
interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  /** Текст/узел метки. Можно передать ReactNode для форматирования. */
  label: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    name,
    placeholder = " ", // важно: не пустой, чтобы заработали peer-placeholder-shown классы
    id,
    className = "",
    "aria-invalid": ariaInvalid,
    ...rest
  },
  ref
): ReactElement {
  // Стабильный уникальный id: исключаем коллизии и проблемы со slug из метки
  const autoId = useId();
  const inputId = id ?? name ?? autoId;

  // Базовые классы инпута. Порядок имеет значение: user className в конце — его правила «победят».
  const inputClasses = [
    "peer w-full rounded-xl px-3 pt-6 pb-2 outline-none",
    "bg-white/10 text-white/90 placeholder-transparent", // placeholder скрываем визуально
    "text-body", // предположительно ваш токен шрифта/размера
    "focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0",
    // Подсветка при ошибке через ARIA (Tailwind arbitrary variants)
    'aria-[invalid="true"]:ring-1 aria-[invalid="true"]:ring-red-500',
    "transition-colors",
    className,
  ]
    .join(" ")
    .trim();

  const labelClasses = [
    "absolute left-3 top-0.5 select-none",
    "text-gray-300 text-body transition-all",
    // Когда поле пустое (placeholder показан) — опускаем и уменьшаем метку
    "peer-placeholder-shown:top-3.5",
    "peer-placeholder-shown:text-gray-400",
    "peer-placeholder-shown:text-base",
    // При фокусе/введённом тексте — поднимаем обратно
    "peer-focus:top-0.5",
    "peer-focus:text-body",
    "peer-focus:text-gray-300",
  ]
    .join(" ")
    .trim();

  return (
    <div className="relative w-full">
      <input
        id={inputId}
        ref={ref}
        name={name}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        className={inputClasses}
        {...rest}
      />
      <label htmlFor={inputId} className={labelClasses}>
        {label}
      </label>
    </div>
  );
});

export default Input;
