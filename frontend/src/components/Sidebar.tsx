import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../context/useAuth";

import icChats from "../assets/sidebar/sidebar_chats_normal.svg";
import icAnalytics from "../assets/sidebar/sidebar_analytics_normal.svg";
import icDatabase from "../assets/sidebar/sidebar_data_normal.svg";
import icMailing from "../assets/sidebar/sidebar_mailing_normal.svg";
import icProfile from "../assets/sidebar/sidebar_profile_normal.svg";
import accountIcon from "../assets/sidebar/sidebar_account.svg";

/**
 * Сайдбар панели администратора (адаптивный + доступный)
 *
 * Что делает:
 * - На экранах ≥ 921px работает как статичный левый сайдбар (sticky).
 * - На экранах ≤ 920px превращается в модальное выпадающее меню-шторку сверху.
 *
 * Зачем так устроено:
 * - В десктопе экономим место контента и даём постоянную навигацию.
 * - В мобилке не крадём высоту: меню показывается по требованию и перекрывает контент,
 *   добавляя полупрозрачную подложку и корректные ARIA-атрибуты (роль диалога).
 *
 * UX/доступность:
 * - Закрытие по клику на подложку и по Escape.
 * - Фокус/клавиатура остаются предсказуемыми: не блокируем TAB, но уводим шторку за пределы экрана, когда она закрыта.
 *
 * Неочевидное:
 * - «Бегунок» активного пункта (highlight/thumb) — это абсолютно позиционированный блок,
 *   чей translateY анимируется по индексу текущего маршрута.
 * - Размеры айтемов вынесены в константы, чтобы не плодить «магические числа» и не ломать синхронизацию высот в CSS.
 */

interface SidebarProps {
  open?: boolean; // Открыта ли шторка на мобилке
  onClose?: () => void; // Коллбэк закрытия (бургер в AppLayout дергает этот проп)
}

interface SidebarItem {
  to: string;
  label: string;
  icon: string; // путь к svg (как к статике)
}

// Неболтливый дефолтный обработчик, когда onClose не передан
const noop = (): void => {};

// ====== Визуальные константы: держим в одном месте ======
const MOBILE_MAX_WIDTH = 920; // брейкпоинт мобилки (px)
const ITEM_HEIGHT = 78 as const; // высота li
const BUTTON_HEIGHT = 72 as const; // высота кликабельной области внутри li
const THUMB_RADIUS = 18 as const; // округление бегунка

export default function Sidebar({ open = false, onClose = noop }: SidebarProps): ReactElement {
  const { user } = useAuth();
  const location = useLocation();

  // Определяем мобильный режим через matchMedia — важно для корректных ARIA-ролей
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // SSR-safe: window может быть недоступен
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return;

    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const onChange = (e: MediaQueryListEvent): void => setIsMobile(e.matches);

    // Старые Safari/Firefox поддерживают addListener; современные — addEventListener
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } else {
      // ts-expect-error: типы для старого API могут отсутствовать, но это безопасный фолбэк
      mql.addEventListener("change", onChange);
      // ts-expect-error
      return () => mql.removeEventListener("change", onChange);
    }
  }, []);

  // Закрываем шторку при клике по пункту навигации на мобильных
  const closeOnMobile = useCallback((): void => {
    if (isMobile) onClose();
  }, [isMobile, onClose]);

  // Закрытие по Escape — только когда меню открыто
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Массив пунктов навигации
  const items = useMemo<SidebarItem[]>(
    () => [
      { to: "/analytics", label: "Аналитика", icon: icAnalytics },
      { to: "/chats", label: "Чаты", icon: icChats },
      { to: "/database", label: "Данные", icon: icDatabase },
      { to: "/mailing", label: "Рассылка", icon: icMailing },
      { to: "/profile", label: "Профиль", icon: icProfile },
    ],
    []
  );

  // Определяем активный пункт по текущему pathname
  const routes = useMemo(() => items.map((item) => item.to), [items]);
  const activeIndex = Math.max(
    0,
    routes.findIndex((path) => location.pathname.startsWith(path))
  );

  // Индекс для анимации бегунка — обновляем и при кликах, и при смене маршрута
  const [animIndex, setAnimIndex] = useState<number>(activeIndex);
  useEffect(() => setAnimIndex(activeIndex), [activeIndex]);

  // Классы контейнера <aside> для обеих адаптаций
  const asideClasses = [
    "font-['Montserrat']",
    "bg-[rgba(19,33,76,0.6)] backdrop-blur-2xl",
    "flex flex-col items-center justify-between",
    "border border-white/10",
    "z-50",
    // Десктоп ≥ 921px
    "min-[921px]:h-[100dvh] min-[921px]:w-[200px]",
    "min-[921px]:sticky min-[921px]:top-0",
    "min-[921px]:rounded-r-[24px]",
    "min-[921px]:pt-16 min-[921px]:pb-2",
    "min-[921px]:translate-y-0",
    // Мобилка ≤ 920px — выезжающая шторка сверху, центрируем по X, задаём ширину
    "fixed top-0 max-[920px]:left-1/2 max-[920px]:-translate-x-1/2",
    "max-[920px]:bg-[rgba(21,36,80,0.3)] max-[920px]:backdrop-blur-[8px]",
    "w-[80%] md:w-[60%] max-[920px]:rounded-b-2xl",
    "max-[920px]:pt-4 max-[920px]:pb-2 max-[920px]:px-4",
    // Анимация появления/исчезновения
    "transition-transform duration-300",
    open ? "translate-y-0" : "-translate-y-full",
  ].join(" ");

  return (
    <>
      {/* Подложка под шторкой (только мобилка) */}
      <div
        onClick={onClose}
        className={[
          "hidden max-[920px]:block fixed inset-0 z-40 transition-opacity",
          "bg-black/30 backdrop-blur-[1px]",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden={!open}
      />

      <aside
        className={asideClasses}
        // На мобилке — это диалог; на десктопе — обычная боковая навигация
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-label="Боковая навигация"
      >
        {/* Верхняя часть */}
        <div className="w-full flex flex-col items-center">
          {/* Кнопка закрытия — только мобилка */}
          <button
            onClick={onClose}
            aria-label="Закрыть меню"
            className="hidden max-[920px]:block self-end mr-3 mb-2 p-2 rounded-xl bg-white/5 active:bg-white/5 focus:outline-none active:scale-[0.98]"
            type="button"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="text-[#dadada42]"
              />
            </svg>
          </button>

          {/* Навигация */}
          <nav className="w-full relative min-[921px]:overflow-y-auto max-[920px]:max-h-[88dvh] max-[920px]:overflow-y-auto">
            {/* Бегунок активного пункта */}
            <div
              aria-hidden={true}
              className="absolute sidebar-btn transition-transform duration-500 ease-in-out will-change-transform pointer-events-none"
              style={{
                position: "absolute",
                height: BUTTON_HEIGHT,
                width: "calc(100% - 24px)",
                left: 12,
                top: 0,
                transform: `translateY(${animIndex * ITEM_HEIGHT}px)`,
                transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                borderRadius: THUMB_RADIUS,
                background:
                  "linear-gradient(135deg, rgba(70,217,188,0.16) 0%, rgba(70,217,188,0.18) 100%)",
                boxShadow:
                  "inset 0 0 16px rgba(255,255,255,0.16), inset 0 4px 12px rgba(255,255,255,0.12)",
              }}
            />

            <ul className="relative z-10 px-3">
              {items.map((item, index) => {
                const isActive = activeIndex === index;

                return (
                  <li key={item.to} className="h-[78px]">
                    <NavLink
                      to={item.to}
                      onClick={() => {
                        setAnimIndex(index); // мгновенно передвигаем бегунок под клик
                        closeOnMobile();
                      }}
                      className="group flex items-center gap-3 max-[980px]:gap-2 max-[880px]:gap-1 h-[72px] w-full pl-4 max-[980px]:pl-3 max-[880px]:pl-2"
                    >
                      {/* Иконка — декоративная, поэтому пустой alt и aria-hidden */}
                      <img
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                        width={40}
                        height={40}
                        className={[
                          "w-[40px] h-[40px] shrink-0 select-none",
                          "transition-opacity duration-300",
                          isActive ? "opacity-100" : "opacity-80 group-hover:opacity-90",
                        ].join(" ")}
                        draggable={false}
                      />
                      <span
                        className={[
                          "text-[14px] leading-none font-medium tracking-[-0.04em]",
                          "transition-colors duration-300",
                          isActive ? "text-white/100" : "text-white/60 group-hover:text-white/80",
                        ].join(" ")}
                      >
                        {item.label}
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Низ: аккаунт */}
        <div className="w-full px-3">
          <div className="flex items-center gap-3 rounded-3xl min-[921px]:px-3 py-3">
            <img src={accountIcon} alt="" aria-hidden="true" className="w-[28px] h-[28px]" />
            <div className="min-w-0">
              {/* Имя/логин — собираем из того, что пришло. Truncate защищает от переполнения. */}
              <div className="text-white/60 text-[12px] leading-tight font-medium tracking-[-0.02em] truncate">
                {`@${user?.username ?? user?.fullName ?? user?.full_name ?? user?.name ?? "Admin"}`}
              </div>
              <div className="text-white/40 text-[12px] leading-tight truncate">
                {user?.email ?? ""}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
