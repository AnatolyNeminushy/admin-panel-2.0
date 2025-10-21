/**
 * CRUD-маршруты по чатам: список, создание/обновление и удаление карточек.
 */
import { Router } from 'express';

import asyncH from '../utils/asyncH';
import * as chats from '../controllers/chats.controller';

const router = Router();

/**
 * GET /chats — выдаёт список чатов с поддержкой фильтров/пагинации (логика в контроллере).
 */
router.get('/', asyncH(chats.list));

/**
 * POST /chats — создаёт или обновляет чат (upsert), если контроллер это поддерживает.
 */
router.post('/', asyncH(chats.createOrUpsert));

/**
 * PUT /chats/:chat_id — сохраняет изменения в конкретном чате.
 */
router.put('/:chat_id', asyncH(chats.update));

/**
 * DELETE /chats/:chat_id — удаляет чат и связанные данные (если предусмотрено контроллером).
 */
router.delete('/:chat_id', asyncH(chats.remove));

export default router;
