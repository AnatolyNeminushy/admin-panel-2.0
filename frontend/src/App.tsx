/**
 * App.tsx
 *
 * Главный композиционный модуль клиентского приложения.
 *
 * Что здесь происходит и зачем:
 * - Инициализируем роутинг (react-router) и провайдер аутентификации.
 * - Страницы подключаем напрямую, чтобы переключение было мгновенным.
 * - Лоадер показываем только во время инициализации авторизации (без перекрытия маршрутов при переходах).
 * - Показываем полноэкранный скелетон/лоадер, пока авторизация инициализируется и чтобы избежать «мигания» UI.
 * - Гарантируем корректную навигацию:
 *     • залогиненный пользователь не увидит /login (редирект на /analytics),
 *     • незалогиненный — не попадёт на защищённые разделы,
 *     • все неизвестные маршруты ведут в /login.
 *
 * Подсказки читателю кода:
 * - Минимальная задержка показа интерфейса (minimumDelayDone) нужна, чтобы убрать мелькание между быстрой инициализацией и рендером.
 * - Сами страницы анимируются внутри AppLayout, поэтому фон и лэйаут остаются статичными.
 */

import { useEffect, useState, type ReactNode, type ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";

import AppLayout from "./components/AppLayout";
import Loader from "./components/Loader";
import Protected from "./components/Protected";

import AuthProvider from "./context/AuthContext";
import { useAuth } from "./context/useAuth";

import ChatsPage from "./pages/chats/ChatsPage";
import AnalyticsPage from "./pages/analytics/AnalyticsPage";
import BasePage from "./pages/database/DatabasePage";
import MailingPage from "./pages/mailing/MailingPage";
import LoginPage from "./pages/login/Login";
import ProfilePage from "./pages/profile/ProfilePage";

/* -------------------------------- Публичный guard --------------------------------
 * Если пользователь уже аутентифицирован — уводим его с /login на основную страницу.
 * Это предотвращает «возвраты» на экран логина кнопкой «Назад».
 */
function PublicOnly({ children }: { children: ReactNode }): ReactElement {
  const { user } = useAuth();
  return user ? <Navigate to="/analytics" replace /> : <>{children}</>;
}

/* -------------------------------- Корневые маршруты приложения --------------------------------
 * Управляет:
 * - состоянием готовности аутентификации,
 * - показом полноэкранного лоадера,
 * - анимированными переходами между страницами.
 */
function AppRoutes(): ReactElement {
  const location = useLocation();
  const { ready, status, user } = useAuth();

  // Минимальная задержка, чтобы исключить «мигание» интерфейса при очень быстром ready.
  const [minimumDelayDone, setMinimumDelayDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinimumDelayDone(true), 320);
    return () => clearTimeout(t);
  }, []);

  // Если пользователь уже вошёл и попал на /login — считаем это редиректным состоянием.
  const isRedirectingFromLogin = Boolean(user) && location.pathname.startsWith("/login");

  // Когда показывать фуллскрин-лоадер:
  // - пока контекст аутентификации не готов,
  // - пока не прошла минимальная задержка,
  // - в момент редиректа с /login после логина,
  // - но не в момент активного логина (status === 'logging-in'), чтобы не гасить UI лишний раз.
  const shouldShowLoader =
    status !== "logging-in" && (!ready || !minimumDelayDone || isRedirectingFromLogin);

  // Держим лоадер чуть дольше, чтобы UI успел смонтироваться без «серого» фона.
  const [loaderVisible, setLoaderVisible] = useState(true);
  useEffect(() => {
    if (shouldShowLoader) {
      setLoaderVisible(true);
      return;
    }

    const timeout = window.setTimeout(() => setLoaderVisible(false), 220);
    return () => window.clearTimeout(timeout);
  }, [shouldShowLoader]);

  return (
    <div className="fixed inset-0 w-full min-h-[100dvh] overflow-hidden  bg-[#152450]">
      {/* Фуллскрин-лоадер без «прыжков» контента */}
      <AnimatePresence>{loaderVisible && <Loader key="app-loader" fullscreen />}</AnimatePresence>

      <div
        className="relative h-full w-full overflow-x-hidden"
        style={{ contain: "layout paint size" }}
      >
        <Routes location={location}>
          {/* Публичный маршрут: страница логина */}
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />

          {/* Защищённая зона с общим лэйаутом */}
          <Route
            path="/"
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            {/* Домашний редирект на основную метрику/дашборд */}
            <Route index element={<Navigate to="/analytics" replace />} />
            <Route path="chats" element={<ChatsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="database" element={<BasePage />} />
            <Route path="mailing" element={<MailingPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Любой неизвестный маршрут — к логину */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </div>
  );
}

/* -------------------------------- Точка входа приложения --------------------------------
 * Оборачиваем всё в BrowserRouter и провайдер аутентификации.
 * BrowserRouter оставляем классическим: для data routers используйте createBrowserRouter там,
 * где вам нужны загрузчики/экшены/деферры — здесь требуется именно декларативный конфиг.
 */
export default function App(): ReactElement {
  return (
    <MotionConfig reducedMotion="never">
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
