
// Отправка операторского сообщения конкретному чату и запись факта отправки в БД.

const { normalizePlatform } = require('../utils/platform');
const pool = require('../db');
const { sendTelegramMessage } = require('./telegram.service');
const { sendVkMessage } = require('./vk.service');

/**
 * Отправляет текст от оператора в заданный чат.
 * 1) Находит платформу по chat_id.
 * 2) Отправляет через соответствующий адаптер.
 * 3) Логирует сообщение в таблицу messages с меткой времени доставки.
 */
exports.sendOperatorMessage = async ({ chatId, text }) => {
  // 1) Найти чат и платформу
  const chatRow = await pool.query(
    'SELECT chat_id, platform FROM chats WHERE chat_id = $1 LIMIT 1',
    [chatId],
  );
  if (!chatRow.rowCount) {
    return { status: 404, error: 'Chat not found' };
  }
  const platform = normalizePlatform(chatRow.rows[0].platform);

  // 2) Отправить
  let isoDate;
  if (platform === 'telegram' || platform === 'tg') {
    isoDate = await sendTelegramMessage(chatId, String(text));
  } else if (platform === 'vk') {
    isoDate = await sendVkMessage(chatId, String(text));
  } else {
    return { status: 400, error: `Unsupported platform: ${platform}` };
  }

  // 3) Сохранить в БД
  const ins = await pool.query(
    `
      INSERT INTO messages (chat_id, from_me, text, date)
      VALUES ($1, true, $2, $3)
      RETURNING id, chat_id, from_me, text, date
    `,
    [chatId, text, isoDate],
  );
  return { status: 200, data: ins.rows[0] };
};
