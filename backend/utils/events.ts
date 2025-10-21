/**
 * Мини-брокер Server-Sent Events: управляет подписчиками и отправляет события
 * в реальном времени для разных разделов админ-панели.
 */
import type { Request, Response } from "express";

/**
 * Храним подписчиков в карте: ключ — название топика, значение — набор HTTP-ответов.
 */
const subscribers = new Map<string, Set<Response>>();

export const ALL_TOPIC = "all";

/**
 * Регистрирует подписчика для указанного топика.
 */
const addSubscriber = (topic: string, res: Response): void => {
  const set = subscribers.get(topic);
  if (set) {
    set.add(res);
    return;
  }
  subscribers.set(topic, new Set([res]));
};

/**
 * Удаляет подписчика и чистит карту, когда слушателей больше нет.
 */
const removeSubscriber = (topic: string, res: Response): void => {
  const set = subscribers.get(topic);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    subscribers.delete(topic);
  }
};

/**
 * Отправляет событие всем слушателям конкретного топика и общему каналу ALL.
 */
export const broadcast = (topic: string, data: unknown): void => {
  const line =
    `event: ${topic}
` +
    `data: ${JSON.stringify(data ?? {})}

`;

  const direct = subscribers.get(topic);
  if (direct) {
    for (const res of direct) {
      try {
        res.write(line);
      } catch {
        // соединение разорвано — пропускаем
      }
    }
  }

  const all = subscribers.get(ALL_TOPIC);
  if (all) {
    for (const res of all) {
      try {
        res.write(line);
      } catch {
        // соединение разорвано — пропускаем
      }
    }
  }
};

/**
 * SSE-эндпоинт: регистрирует клиента и периодически отправляет ping,
 * чтобы не засыпало соединение. При закрытии убирает подписчика.
 */
export const sseHandler = (req: Request, res: Response): void => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const topicsParam = String(req.query.topics ?? ALL_TOPIC).trim();
  const topics = topicsParam
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (topics.length === 0) {
    topics.push(ALL_TOPIC);
  }

  for (const topic of topics) addSubscriber(topic, res);

  res.write(`event: ready
`);
  res.write(`data: ${JSON.stringify({ topics })}

`);

  const ping = setInterval(() => {
    try {
      res.write(
        `event: ping
` +
          `data: ${Date.now()}

`
      );
    } catch {
      // если запись не удалась, ждём очистки onClose
    }
  }, 25_000);

  const onClose = (): void => {
    clearInterval(ping);
    for (const topic of topics) removeSubscriber(topic, res);
    try {
      res.end();
    } catch {
      // соединение уже закрылось
    }
  };

  req.on("close", onClose);
  req.on("end", onClose);
};
