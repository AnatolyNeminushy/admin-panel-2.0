/**
 * Точка входа клиентского приложения на React.
 *
 * Что делает:
 * - Находит корневой DOM-узел и монтирует в него SPA-приложение.
 * - Оборачивает <App /> в React.StrictMode для включения дополнительных dev-проверок
 *   и раннего обнаружения побочных эффектов.
 *
 * Почему так:
 * - createRoot из "react-dom/client" — современный API,
 *   обеспечивает корректную конкурентную модель рендера.
 * - Явная проверка наличия корневого узла даёт «fail fast» и упрощает диагностику
 *   проблем с разметкой (например, если index.html не содержит контейнер).
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

// Неочевидный момент: getElementById может вернуть null, поэтому делаем явную проверку,
// чтобы не получить «тихий» краш глубже в React.
const rootElement = document.getElementById("root");

if (!rootElement) {
  // Сообщаем причину как можно раньше: удобнее искать проблему в разметке/шаблоне.
  throw new Error('Не найден корневой элемент с id="root". Проверьте index.html.');
}

// createRoot — предпочтительный способ монтирования на 2025 год для SPA без SSR.
const root = createRoot(rootElement as HTMLElement);

root.render(<App />);
