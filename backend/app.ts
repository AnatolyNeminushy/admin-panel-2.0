/**
 * Конфигурация Express-приложения.
 * Здесь собираются все глобальные middleware, предметные роуты и единая обработка ошибок,
 * чтобы точка входа (index.ts) оставалась минимальной, а структура API была прозрачной.
 */
import express, {
  Application,
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from 'express';
import cors from 'cors';

/**
 * Импорт отдельных роутеров по доменам.
 * Каждый модуль инкапсулирует собственные эндпоинты и зависимости, что облегчает поддержку.
 */
import authRoutes from './routes/auth.routes';
import broadcastsRoutes from './routes/broadcasts.routes';
import chatsRoutes from './routes/chats.routes';
import eventsRoutes from './routes/events.routes';
import healthRoutes from './routes/health.routes';
import messagesRoutes from './routes/messages.routes';
import ordersRoutes from './routes/orders.routes';
import reservesRoutes from './routes/reserves.routes';
import statsRoutes from './routes/stats.routes';

const app: Application = express();

/**
 * CORS: по умолчанию разрешаем все источники (удобно во время разработки),
 * но в боевом окружении можно выставить CORS_ORIGIN, чтобы ограничить список доверенных фронтендов.
 */
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', // твой фронт
  credentials: true,
}));

/**
 * Body parser: Express 4.x не включает JSON-парсер по умолчанию.
 * Ограничение в 1 МБ защищает сервер от слишком больших payload’ов.
 */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true })); // поддержка form-urlencoded для клиентов

/**
 * Anti-cache middleware: ставим заголовок no-store, потому что интерфейс оперирует свежими списками.
 * Особенно важно для административных панелей, где данные часто изменяются.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * Маршруты сгруппированы по функциональным направлениям.
 * Порядок важен: сначала health-check, затем API-prefixed роуты.
 */
app.use('/health', healthRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/stat', statsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reserves', reservesRoutes);
app.use('/api/broadcasts', broadcastsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);

/**
 * Обработка 404: если ни один из маршрутов не совпал, отправляем единый JSON-ответ.
 * Это позволяет фронтенду всегда полагаться на однородный формат ошибки.
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Централизованный обработчик ошибок: ловит исключения и обеспечивает предсказуемый ответ.
 * Express передаёт ошибку сюда, если в обработчиках был вызван next(err) или произошло необработанное исключение.
 */
const apiErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('API error:', err);
  const status =
    typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status?: number }).status
      : 500;
  const message = err instanceof Error && err.message ? err.message : 'Internal Server Error';
  res.status(status ?? 500).json({ error: message });
};

app.use(apiErrorHandler);

export default app;
