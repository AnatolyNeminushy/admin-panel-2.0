
import type { RequestHandler } from 'express';

import type { ErrorResponse } from '../types/models';

/**
 * Расширенный контроллер рассылок: отвечает за предпросмотр и запуск массовых отправок
 * через Telegram/VK. Валидирует параметры и делегирует бизнес-логику сервису broadcast.service.
 */
const { previewRecipients, runBroadcast } = require('../services/broadcast.service') as {
  previewRecipients: (args: PreviewRecipientsArgs) => Promise<PreviewRecipient[]>;
  runBroadcast: (args: BroadcastPayload) => Promise<BroadcastResult>;
};

type BroadcastMode = 'all' | 'limit' | 'selected';

type Platform = 'tg' | 'vk';

type BroadcastErrorResponse = ErrorResponse & {
  testMode: boolean;
  total: number;
  sent: number;
  failed: number;
  items: Array<Record<string, unknown>>;
  mode: BroadcastMode;
};

type BroadcastSendResponse = BroadcastResult | BroadcastErrorResponse;

interface BroadcastFilters {
  onlyActiveDays?: number;
  minOrders?: number;
  platform?: string;
}

interface PreviewRecipientsArgs {
  filters?: BroadcastFilters;
  platforms?: Platform[];
  limit?: number | null;
}

interface PreviewRecipient {
  chat_id: number;
  platform: string | null;
}

interface BroadcastPayload {
  title?: string;
  text?: string;
  imageUrl?: string | null;
  platforms?: string[];
  filters?: BroadcastFilters;
  testMode?: boolean;
  mode?: BroadcastMode;
  limit?: number | null;
  recipientIds?: Array<string | number>;
}

interface BroadcastResult {
  error?: string;
  title?: string;
  testMode: boolean;
  total: number;
  sent: number;
  failed: number;
  items: Array<Record<string, unknown>>;
  mode: BroadcastMode;
}

interface BroadcastPreviewQuery {
  platforms?: string | string[];
  filters?: string;
  limit?: string;
}

interface BroadcastPreviewResponse {
  total: number;
  items: PreviewRecipient[];
}

interface BroadcastSendBody {
  title?: string;
  text?: string;
  imageUrl?: string | null;
  platforms?: string[];
  filters?: BroadcastFilters;
  testMode?: boolean;
  mode?: BroadcastMode;
  limit?: number | string | null;
  recipientIds?: Array<string | number>;
}

const ALLOWED_PLATFORMS = new Set<Platform>(['tg', 'vk']);
const ALLOWED_MODES = new Set<BroadcastMode>(['all', 'limit', 'selected']);

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value as string[];
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const toJSON = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const sanitizePlatforms = (value: unknown, fallback: Platform[]): Platform[] => {
  const arr = toArray(value)
    .map((p) => p.toLowerCase())
    .filter((p): p is Platform => ALLOWED_PLATFORMS.has(p as Platform));
  return arr.length ? arr : fallback;
};

const toPositiveIntOrNull = (value: unknown): number | null => {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return Math.trunc(num);
  return null;
};

const isArrayOfStringOrNumber = (value: unknown): value is Array<string | number> =>
  Array.isArray(value) && value.every((x) => ['string', 'number'].includes(typeof x));

/**
 * GET /api/broadcasts/recipients/preview
 * • Принимает список платформ (строкой или массивом) и объект фильтров (JSON).
 * • Возвращает предварительный список получателей, на которых будет отправка.
 * • Параметр `limit` позволяет ограничить выдачу (по умолчанию 200).
 */
export const preview: RequestHandler<
  unknown,
  BroadcastPreviewResponse,
  unknown,
  BroadcastPreviewQuery
> = async (req, res, next) => {
  try {
    const platforms = sanitizePlatforms(req.query.platforms, ['tg', 'vk'] as Platform[]);
    const filters = toJSON<BroadcastFilters>(req.query.filters, {
      onlyActiveDays: 90,
      minOrders: 0,
      platform: 'any',
    });
    const limit = toPositiveIntOrNull(req.query.limit) ?? 200;

    const items = (await previewRecipients({ platforms, filters, limit })) || [];
    return res.json({ total: items.length, items });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/broadcasts
 * • Режимы: 'all' (всем по фильтрам), 'limit' (первым N) и 'selected' (список chat_id).
 * • В тестовом режиме (`testMode=true`) отправка не происходит, возвращается только статистика.
 * • При боевой отправке делегируем работу сервису и возвращаем результат (успехи/ошибки).
 */
export const sendBroadcast: RequestHandler<unknown, BroadcastResult | ErrorResponse, BroadcastSendBody> = async (
  req,
  res,
  next,
) => {
  try {
    const {
      title = 'Без названия',
      text = '',
      imageUrl = null,
      platforms: rawPlatforms = ['tg'],
      filters = { onlyActiveDays: 90, minOrders: 0, platform: 'any' },
      testMode = true,
      mode: rawMode = 'all',
      limit: rawLimit = null,
      recipientIds: rawRecipientIds = [],
    } = req.body ?? {};

    const platforms = sanitizePlatforms(rawPlatforms, ['tg'] as Platform[]);
    const mode = String(rawMode) as BroadcastMode;

    if (!ALLOWED_MODES.has(mode)) {
      return res.status(400).json({ error: 'Invalid mode', testMode: Boolean(testMode), total: 0, sent: 0, failed: 0, items: [], mode });
    }

    if (!text.trim() && mode !== 'selected') {
      return res.status(400).json({ error: 'Пустой текст', testMode: Boolean(testMode), total: 0, sent: 0, failed: 0, items: [], mode });
    }

    let limit: number | null = null;
    if (mode === 'limit') {
      limit = toPositiveIntOrNull(rawLimit);
      if (!limit) {
        return res
          .status(400)
          .json({ error: 'limit must be a positive integer for mode=limit', testMode, total: 0, sent: 0, failed: 0, items: [], mode });
      }
    }

    let recipientIds: Array<string | number> = [];
    if (mode === 'selected') {
      if (!isArrayOfStringOrNumber(rawRecipientIds) || rawRecipientIds.length === 0) {
        return res.status(400).json({ error: 'recipientIds must be a non-empty array', testMode: Boolean(testMode), total: 0, sent: 0, failed: 0, items: [], mode });
      }
      recipientIds = rawRecipientIds;
    }

    const result = await runBroadcast({
      title,
      text,
      imageUrl,
      platforms,
      filters,
      testMode: Boolean(testMode),
      mode,
      limit,
      recipientIds,
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
};
