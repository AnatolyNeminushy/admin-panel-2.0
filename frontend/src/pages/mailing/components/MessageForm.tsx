/**
 * Форма контента кампании.
 *
 * Зачем: помогает быстро собрать “скелет” рассылки — название, текст и превью-баннер.
 * Компонент полностью *контролируемый*: значения хранятся во внешнем состоянии (lifted state),
 * а эта форма только отображает и сообщает об изменениях.
 */

import { useId, type Dispatch, type SetStateAction } from "react";

interface MessageFormProps {
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  imageUrl: string;
  setImageUrl: Dispatch<SetStateAction<string>>;
}

export default function MessageForm({
  title,
  setTitle,
  text,
  setText,
  imageUrl,
  setImageUrl,
}: MessageFormProps) {
  // useId даёт стабильные id на клиенте и сервере — ключ для корректной связки label/field в SSR.
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const textId = `${baseId}-text`;
  const imageId = `${baseId}-image`;
  const hintId = `${baseId}-hint`;

  return (
    <div className="bg-[#0f1a3a]/70 backdrop-blur-xl border border-white/5 rounded-2xl p-4 space-y-3 shadow">
      {/* Название кампании — это «визитка» рассылки: по ней удобно искать и смотреть логи. */}
      <div>
        <label htmlFor={titleId} className="block text-body text-white/40 mb-1">
          Название кампании
        </label>
        <input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          className="w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/70 px-3 py-2 outline-none"
          placeholder="Например: Промо −20% до воскресенья"
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
        />
      </div>

      {/* Основной текст: plain-text без форматирования — оставляем простор для набора. */}
      <div>
        <label htmlFor={textId} className="block text-body text-white/40 mb-1">
          Текст сообщения
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          rows={15}
          className="w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/70 px-3 py-2 outline-none"
          placeholder="Привет! Сегодня у нас спецпредложение…"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
        />
        <div id={hintId} className="text-body text-white/30 mt-1" aria-live="polite">
          Простой текст + превью картинки (если указать URL ниже).
        </div>
      </div>

      {/* Ссылка на баннер: мини-превью моментально покажет битый URL или неверный формат. */}
      <div>
        <label htmlFor={imageId} className="block text-body text-white/40 mb-1">
          Картинка (URL, опционально)
        </label>
        <input
          id={imageId}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.currentTarget.value)}
          className="w-full rounded-xl bg-[#0b132b] placeholder-white/40 text-white/70 px-3 py-2 outline-none"
          placeholder="https://…/banner.jpg"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={imageUrl ? undefined : hintId}
        />

        {imageUrl ? (
          <div className="mt-2">
            {/* 
              Ленивая загрузка + async декодирование сокращают блокировки главного потока.
              object-contain — чтобы баннер не «ломал» карточку при нестандартных пропорциях.
            */}
            <img
              src={imageUrl}
              alt="Предпросмотр изображения"
              className="rounded-xl max-h-40 object-contain"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Мини-подсказка: скрываем битое превью, чтобы не мешало восприятию формы.
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
