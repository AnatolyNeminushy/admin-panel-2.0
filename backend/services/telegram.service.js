// services/telegram.service.js
// Минимальный адаптер отправки сообщений в Telegram Bot API.

const fetch = globalThis.fetch;
if (!fetch) {
  throw new Error(
    'Global fetch is not available. Use Node 18+ or polyfill (e.g., node-fetch).',
  );
}

/**
 * Отправляет HTML-сообщение в Telegram и возвращает ISO-время доставки,
 * взятое из ответа Bot API (или текущее время, если поле отсутствует).
 */
exports.sendTelegramMessage = async (chat_id, text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram send failed');

  const ts = data.result?.date ? data.result.date * 1000 : Date.now();
  return new Date(ts).toISOString();
};
