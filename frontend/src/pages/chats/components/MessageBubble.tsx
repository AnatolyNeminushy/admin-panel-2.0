/**
 * Компонент "MessageBubble"
 * -------------------------
 * Зачем: отрисовывает одно сообщение чата в виде «пузыря» (bubble), с учётом роли отправителя
 * (гость/оператор/бот), аватарки и времени сообщения. Компонент рассчитан на работу в списке.
 *
 * ПОДСКАЗКА ДЛЯ ЧИТАТЕЛЯ:
 * Если из API приходят нестабильные по типу поля (string/number/boolean), старайтесь приводить их к нормальной
 * форме в одном месте (как здесь — isTruthy/normalizeRole). Это делает компонент предсказуемым и упрощает тесты.
 */

import platformIcon from "@/assets/icons/chats/avatar.svg";
import botAvatar from "@/assets/images/social/tg.jpg";

export type MessageBubblePosition = 'single' | 'start' | 'middle' | 'end'

export interface ChatMessage {
  id?: number | string
  _tempId?: number | string
  _clientOrder?: number
  date?: string | number | Date | null
  from_me?: boolean | number | string
  role?: string
  sender?: string
  author?: string
  sender_name?: string
  platform?: string
  is_operator?: boolean | number | string
  from_operator?: boolean | number | string
  is_bot?: boolean | number | string
  text?: string
  [key: string]: unknown
}

interface MessageBubbleProps {
  msg: ChatMessage
  /** Резерв под «склейку» пузырей в одну группу (визуальные хвостики и радиусы) */
  position?: MessageBubblePosition
  className?: string
}

/** SVG-фоллбек для аватарки бота — встроенный и надёжный (не зависит от сети/CDN) */
const BOT_FALLBACK: string =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#60a5fa"/>
  </linearGradient></defs>
  <circle cx="32" cy="32" r="31" fill="url(#g)"/>
  <rect x="18" y="22" width="28" height="20" rx="10" fill="white" opacity="0.9"/>
  <circle cx="26" cy="32" r="3.5" fill="#0f172a"/>
  <circle cx="38" cy="32" r="3.5" fill="#0f172a"/>
  <rect x="28" y="44" width="8" height="6" rx="3" fill="white" opacity="0.9"/>
</svg>`)

/** Унифицированное приведение «псевдо-булевых» значений из API к boolean */
const isTruthy = (value: unknown): boolean =>
  value === true ||
  value === 1 ||
  value === '1' ||
  value === 'true' ||
  value === 'yes' ||
  value === 'y'

/** Приводим role к унифицированной строчке */
const normalizeRole = (value: unknown): string => String(value ?? '').toLowerCase().trim()

/** Безопасный парсинг даты (возвращает null при невалидном значении) */
const parseDate = (input: ChatMessage['date']): Date | null => {
  if (input == null) return null
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Форматируем время как HH:mm по ru-RU без am/pm */
const formatTimeHHmm = (date: Date | null): string | null => {
  if (!date) return null
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    return null
  }
}

/** Компактный util для склейки классов без лишней магии: строка | false | null | undefined */
const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

export default function MessageBubble({
  msg,
  position: _position, // пока не используем — зарезервировано под «склейку» пузырей
  className = '',
}: MessageBubbleProps) {
  // Важно: флаг «моё сообщение» приходит из разных источников (boolean/1/'1'/'true')
  const mine = isTruthy(msg?.from_me)

  // Унифицируем «роль» — бэкенды любят присылать кто-как
  const role =
    normalizeRole(msg?.role ?? msg?.sender ?? msg?.author ?? msg?.sender_name)

  // Оператор — это «я», но с подходящей ролью или явными серверными флагами
  const isOperator =
    mine &&
    (['operator', 'admin', 'manager', 'support', 'agent', 'оператор'].includes(role) ||
      isTruthy(msg?.is_operator) ||
      isTruthy(msg?.from_operator))

  // Бот — это не оператор, но может быть «я» (сервисные сообщения), или явные признаки бота
  const isBot =
    !isOperator &&
    (mine ||
      ['bot', 'assistant', 'ai', 'system', 'irbi'].includes(role) ||
      normalizeRole(msg?.platform) === 'bot' ||
      isTruthy(msg?.is_bot))

  // Гость — любое входящее, которое не бот
  const isGuest = !mine && !isBot

  const date = parseDate(msg?.date)
  const time = formatTimeHHmm(date)

  // Выбираем аватарку и alt-текст
  const avatarSrc = isBot ? botAvatar : platformIcon
  const avatarAlt = isBot ? 'bot' : String(msg?.platform ?? 'guest')

  // Цветовая схема bubble: «моё» => тёмно-синий, «чужое» => бирюзовый
  const bubbleCls = cx(
    'px-3 pt-2 pb-1 rounded-2xl shadow-md',
    'whitespace-pre-wrap break-words',
    'min-w-[10%]',
    mine ? 'bg-[#13214A]' : 'bg-[#199790]',
    'text-white relative',
  )

  return (
    <div className={cx('relative pl-12 pr-4 mb-1', className)}>
      {(isBot || isGuest) && (
        <img
          src={avatarSrc}
          alt={avatarAlt}
          className="absolute left-2 top-1 w-8 h-8 rounded-full object-cover select-none z-0 opacity-70"
          draggable={false}
          onError={(event) => {
            // Подстраховка: если внешняя картинка не загрузилась — показываем встроенный SVG
            event.currentTarget.src = BOT_FALLBACK
          }}
        />
      )}

      <div className="flex justify-start">
        <div className={bubbleCls}>
          {/* Тело сообщения. whitespace-pre-wrap позволяет сохранять переносы из исходного текста. */}
          <div className="opacity-80">{msg?.text}</div>

          {/* Время показываем только если валидно распарсили */}
          {time && (
            <div className="text-[11px] mt-[-2px] opacity-40 text-right">
              {time}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
