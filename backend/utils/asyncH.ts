/**
 * Асинхронный хелпер для express-маршрутов.
 * Вместо того чтобы оборачивать каждый контроллер в try/catch,
 * оборачиваем функцию в asyncH — отклонённые промисы будут переданы в next(),
 * а дальше сработает общий error handler приложения.
 */
import type { RequestHandler } from 'express';

type AnyRequestHandler = RequestHandler<any, any, any, any, any>;

/**
 * Оборачивает контроллер и переадресует ошибки в next().
 * Promise.resolve гарантирует, что и sync, и async обработчики будут обработаны одинаково.
 * При этом сохраняем оригинальные дженерики RequestHandler, чтобы не ломать типизацию.
 */
export function asyncH<Handler extends AnyRequestHandler>(fn: Handler): Handler {
  const wrapped: AnyRequestHandler = (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };

  return wrapped as Handler;
}

export default asyncH;
