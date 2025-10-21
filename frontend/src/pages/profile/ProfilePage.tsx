/**
 * Профиль пользователя
 *
 * Что это:
 * - Экран профиля с «скелетоном» загрузки, сообщением об ошибке и данными пользователя.
 * - Управляет тремя ключевыми действиями: выход, обновление данных, очистка локального токена.
 *
 * Почему так:
 * - Отрисовываем три состояния (loading / success / empty) — это делает UX предсказуемым.
 * - Семантическая разметка (<main>, <article>, <header>, роли ARIA) улучшает доступность и индексируемость.
 * - Видимые кнопки — явные действия. Подсказки (title) декларируют намерение для читателя и QA.
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useProfile } from "./hooks/useProfile";
import { fmtDateTime as fmt } from "./utils/format";
import { Info } from "./components/Info";
import { ReactElement } from "react";

export default function ProfilePage(): ReactElement {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Хук-оркестратор страницы: собирает данные профиля и готовые действия.
  const { user, loading, err, onLogout, refresh, clearLocal, initial } = useProfile({
    navigate,
    logout,
  });

  // Неочевидный момент: нормализуем отображаемое имя в один источник правды.
  const displayName = (user?.fullName ?? user?.full_name)?.trim() || "Без имени";

  return (
    <main className="flex-1 pb-6 pt-12">
      <article
        className="bg-[#0f1a3a]/70 backdrop-blur-2xl rounded-2xl shadow p-6"
        aria-busy={loading}
      >
        {loading ? (
          <Skeleton />
        ) : user ? (
          <>
            {/* Шапка профиля: аватар с инициалами + базовые идентификаторы пользователя */}
            <header className="flex items-center gap-4 mb-6">
              {/* Мини-аватар: цвет/контраст подобран под тёмный фон */}
              <div
                className="h-16 w-16 rounded-full bg-emerald-600 text-white/70 flex items-center justify-center text-2xl font-bold"
                aria-hidden="true"
              >
                {initial}
              </div>
              <div>
                <h1 className="text-xl font-semibold">{displayName}</h1>
                {/* Email как вторичный идентификатор */}
                <p className="text-white/40">{user.email}</p>
              </div>
            </header>

            {/* Сообщение об ошибке: важно role="alert" для ассистивных технологий */}
            {err && (
              <div className="text-body text-red-600 mb-3" role="alert">
                {err}
              </div>
            )}

            {/* Информационные поля профиля: используем «универсальную» карточку Info */}
            <section className="grid md:grid-cols-2 gap-4 mb-6">
              <Info label="Роль" value={user.role} />
              <Info
                label="Статус"
                value={user.is_active === undefined ? "—" : user.is_active ? "Активен" : "Отключён"}
              />
              <Info label="Последний вход" value={fmt(user.last_login_at)} />
              <Info label="Аккаунт создан" value={fmt(user.created_at)} />
            </section>

            {/* Блок действий: управляет сессией и кэшем. */}
            <section className="flex flex-wrap gap-3" aria-label="Действия с профилем">
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2 rounded-xl bg-[#154c5b]/90 text-white font-semibold hover:bg-[#154c5b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#154c5b]/60"
                title="Выйти из аккаунта и очистить локальные токены"
              >
                Выйти из аккаунта
              </button>

              <button
                type="button"
                onClick={refresh}
                className="px-4 py-2 rounded-xl text-white/70 bg-black/20 font-semibold hover:bg-black/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/30"
                title="Перезагрузить данные профиля"
              >
                Обновить данные
              </button>

              <button
                type="button"
                onClick={clearLocal}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500/60"
                title="Очистить локальный токен и вернуться на страницу входа"
              >
                Очистить токен и выйти
              </button>
            </section>
          </>
        ) : (
          // Состояние «пользователь не найден»: предлагаем безопасный путь восстановления.
          <div className="text-white/70 pl-4">
            Пользователь не найден. Возможно, токен истёк{" "}
            <button
              type="button"
              onClick={clearLocal}
              className="underline text-emerald-300"
              title="Очистить локальные токены и перейти к авторизации"
            >
              Войти заново
            </button>
          </div>
        )}
      </article>
    </main>
  );
}

/**
 * Скелетон: визуальная подсказка загрузки (ARIA role="status" + aria-live).
 * Зачем: снижает «скачок» интерфейса, помогает пользователю понять, что запрос идёт.
 */
function Skeleton(): ReactElement {
  return (
    <div className="animate-pulse" role="status" aria-live="polite" aria-label="Загрузка профиля">
      <div className="h-16 w-16 rounded-full bg-slate-200/40 mb-4" />
      <div className="h-5 w-48 bg-slate-200/40 mb-2" />
      <div className="h-4 w-64 bg-slate-200/40 mb-6" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-10 bg-slate-200/40 rounded" />
        <div className="h-10 bg-slate-200/40 rounded" />
        <div className="h-10 bg-slate-200/40 rounded" />
        <div className="h-10 bg-slate-200/40 rounded" />
      </div>
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
