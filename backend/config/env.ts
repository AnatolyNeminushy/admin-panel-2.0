/**
 * Ранний бутстрап переменных окружения перед запуском остального кода бекенда.
 * Загружаем dotenv-flow в непроизводственных окружениях, чтобы переопределить process.env.
 */
if (process.env.NODE_ENV !== 'production') {
  try {
    // В TypeScript это допустимо для CJS; приглушаем правило о require в TS:
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenvFlow: unknown = require('dotenv-flow');

    // Поддерживаем разные варианты экспорта библиотеки
    const cfg =
      (dotenvFlow as { config?: () => void }).config ??
      ((dotenvFlow as { default?: { config?: () => void } }).default?.config);

    if (typeof cfg === 'function') {
      cfg();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn('[dotenv-flow] skipped:', message);
  }
}

// Этот пустой экспорт помечает файл как модуль (чтобы не было конфликтов с глобальной областью видимости)
export {};
