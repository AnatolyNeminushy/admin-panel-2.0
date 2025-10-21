
/**
 * Маршруты работы с сообщениями: получение истории, webhooks и отправка от оператора.
 */
import { Router } from 'express';
import type { RequestHandler } from 'express';

import asyncH from '../utils/asyncH';
import * as messages from '../controllers/messages.controller';
import { sendOperatorMessage } from '../services/send.service';

const router = Router();

/**
 * GET /messages — выдаёт список сообщений с учётом фильтров/пагинации из контроллера.
 */
router.get('/', asyncH(messages.list));

/**
 * POST /messages/raw — приём «сырых» сообщений от внешних интеграций (webhook).
 */
router.post('/raw', asyncH(messages.createRaw));

/**
 * PUT /messages/:id — обновление полей сообщения (например, статуса доставки).
 */
router.put('/:id', asyncH(messages.update));

/**
 * DELETE /messages/:id — удаление сообщения.
 */
router.delete('/:id', asyncH(messages.remove));

/**
 * Тело запроса при отправке сообщения от оператора гостю.
 */
type SendBody = {
  chatId?: string | number;
  text?: string;
};

/**
 * POST /messages — отправка ответа от оператора; передаём chatId и текст.
 * Контроллер возвращает 400, если данные невалидны, 502 — если внешний сервис упал.
 */
const sendMessage: RequestHandler<unknown, unknown, SendBody> = async (req, res) => {
  const { chatId, text } = req.body ?? {};
  if (!chatId || !text || String(text).trim() === '') {
    return res.status(400).json({ error: 'chatId and text are required' });
  }

  try {
    const result = await sendOperatorMessage({ chatId, text });
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.data);
  } catch (error) {
    console.error('Send error:', error);
    return res.status(502).json({ error: 'Upstream send failed' });
  }
};

router.post('/', asyncH(sendMessage));

export default router;
