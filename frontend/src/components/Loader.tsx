import { motion, type Transition } from "framer-motion";

/**
 * Компонент: визуальный индикатор загрузки (Loader).
 *
 * Зачем:
 * - Показывает пользователю, что интерфейс занят: идёт загрузка данных, подготовка отчёта,
 *   инициализация маршрута и т.п.
 * - Поддерживает два режима: встраиваемый (занимает всю доступную область контейнера)
 *   и полноэкранный оверлей поверх всего приложения.
 *
 * Что внутри:
 * - Семантика доступности: контейнер помечен как `role="status"` + `aria-busy="true"`,
 *   а текстовая подпись озвучивается скринридерами (`aria-live="polite"`).
 * - Микроанимации: точки «прыгают» с поэтапной задержкой. Используем Tailwind `animate-bounce`
 *   и синхронизируем тайминг через инлайн-delay, чтобы анимация выглядела «живее».
 * - Анимация появления/исчезновения самого лоадера — через framer-motion.
 *
 * Подсказки по использованию:
 * - Включайте `fullscreen`, когда нужно заблокировать пользовательское взаимодействие на время
 *   критической операции. Для локальных спиннеров (внутри карточек/блоков) оставляйте `false`.
 * - Старайтесь передавать осмысленный `label`, чтобы пользователю было понятно, что именно происходит
 *   («Сохраняем черновик…», «Собираем отчёт…»). Если label пустой, экранные читалки увидят лишь визуальную анимацию.
 */

const DOTS = [0, 1, 2, 3] as const;

interface LoaderProps {
  /** Текстовая подпись статуса. Полезно для доступности и контекста действий. */
  label?: string;
  /** Режим полноэкранного оверлея: перекрывает приложение и фиксируется к вьюпорту. */
  fullscreen?: boolean;
}

/** Единые кривые Безье и длительности для консистентности микроанимаций. */
const overlayTransition: Transition = { duration: 0.35, ease: [0.4, 0, 0.2, 1] };
const contentTransition: Transition = { duration: 0.45, ease: [0.4, 0, 0.2, 1] };

export default function Loader({ label = "Загрузка...", fullscreen = false }: LoaderProps) {
  // Формируем класс контейнера. В режиме оверлея — фиксируемся к вьюпорту с высоким z-index;
  // иначе — заполняем родительский контейнер.
  const containerClass = [
    "flex items-center justify-center text-white",
    fullscreen ? "fixed inset-0 z-[2000] bg-[#152450]" : "w-full h-full",
  ].join(" ");

  const overlayInitial = fullscreen ? { opacity: 1 } : { opacity: 0 };

  return (
    <motion.div
      className={containerClass}
      role="status"
      aria-live="polite"
      aria-busy="true"
      initial={overlayInitial}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={overlayTransition}
    >
      <motion.div
        className="flex flex-col items-center gap-6 text-center"
        initial={{ opacity: 0.75, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={contentTransition}
      >
        {/* Визуальные точки-индикаторы. Помечаем как aria-hidden, чтобы не «болтали» в SR. */}
        <div className="flex h-14 items-end gap-2" aria-hidden="true">
          {DOTS.map((dot) => (
            <span
              key={dot}
              className="h-3 w-3 rounded-full bg-white/80 opacity-40 animate-bounce [animation-timing-function:cubic-bezier(0.4,0,0.2,1)]"
              // Небольшой сдвиг по времени создаёт «волну». Делаем явную строку секунды для CSS.
              style={{
                animationDelay: `${dot * 0.12}s`,
                animationDuration: "0.9s",
              }}
            />
          ))}
        </div>

        {/* Текст статуса. Если label пустой — не рендерим узел, чтобы не засорять DOM. */}
        {label ? (
          <span className="text-body font-semibold uppercase tracking-[0.25em] text-white/80">
            {label}
          </span>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
