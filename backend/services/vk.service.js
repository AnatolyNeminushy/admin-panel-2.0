// services/vk.service.js
// Минимальный адаптер отправки сообщений во VK messages.send.

const fetch = globalThis.fetch;
if (!fetch) {
  throw new Error(
    'Global fetch is not available. Use Node 18+ or polyfill (e.g., node-fetch).',
  );
}

/**
 * Отправляет текстовое сообщение во VK и возвращает ISO-время отправки (локально).
 */
exports.sendVkMessage = async (peer_id, text) => {
  const token = process.env.VK_TOKEN;
  if (!token) throw new Error('VK_TOKEN is not set');

  const params = new URLSearchParams({
    v: '5.131',
    access_token: token,
    peer_id: String(peer_id),
    random_id: String(Math.floor(Math.random() * 1e9)),
    message: text,
  });

  const res = await fetch('https://api.vk.com/method/messages.send', {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.error_msg || 'VK send failed');

  return new Date().toISOString();
};
