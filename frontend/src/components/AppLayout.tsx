import { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import Sidebar from "./Sidebar";
import "../index.css";

/**
 * Каркас приложения (application shell) с верхней «шторкой» для открытия меню.
 *
 * Что делает:
 * 1) Управляет off-canvas Sidebar на мобильных (открыть/закрыть).
 * 2) Блокирует прокрутку <body> во время открытого меню и предотвращает «скачок» прокрутки (anti scroll-jump).
 * 3) Учитывает безопасные отступы (safe-area-inset) на iOS.
 * 4) Анимирует появление/скрытие кнопки открытия меню и не даёт контенту перекрываться.
 *
 * Заметки по реализации:
 * - Блокируем прокрутку через position: fixed у <body> и запоминаем scrollY.
 *   Это работает стабильнее, чем overflow: hidden, и корректно ведёт себя на iOS.
 * - При закрытии меню возвращаем исходные стили и позицию прокрутки.
 * - Делаем корректный cleanup при размонтировании: если компонент убрали из DOM с открытым меню,
 *   стили <body> возвращаются в норму.
 * - Используем 100dvh: современная единица, правильно учитывающая адресную строку на мобильных.
 */

export default function AppLayout(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const scrollYRef = useRef(0);
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const isChatsPage = pathname.startsWith("/chats");
  const baseMainClass =
    "flex-1 w-full max-w-[1440px] mx-auto overflow-y-auto scrollbar-fade lg:pl-8";
  const mainClassName = `${baseMainClass} ${isChatsPage ? " md:px-4" : "px-4"}`;

  const lockBodyScroll = useCallback(() => {
    scrollYRef.current = window.scrollY;
    const { style } = document.body;

    style.position = "fixed";
    style.top = `-${scrollYRef.current}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
  }, []);

  const releaseBodyScroll = useCallback(() => {
    const { style } = document.body;
    const top = style.top;

    style.position = "";
    style.top = "";
    style.left = "";
    style.right = "";
    style.width = "";

    if (top) {
      const previous = Number.parseInt(top, 10);
      window.scrollTo(0, -previous);
    }
  }, []);

  const openMenu = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
    } else {
      releaseBodyScroll();
    }
  }, [isOpen, lockBodyScroll, releaseBodyScroll]);

  // Глобальный cleanup: если компонент размонтировали при открытом меню —
  // вернуть стили прокрутки на <body>.
  useEffect(() => {
    return () => {
      releaseBodyScroll();
    };
  }, [releaseBodyScroll]);

  return (
    <div className="w-full h-[100dvh] min-h-[100dvh] flex bg-app overflow-hidden">
      {/* Off-canvas слой. Сам Sidebar рендерится поверх контента */}
      <Sidebar open={isOpen} onClose={closeMenu} />

      {/* Полупрозрачная подложка под модальным меню на мобильных */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMenu}
          aria-label="Закрыть меню"
        />
      )}

      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative ">
        {/* Верхний safe-area отступ — только на мобильных */}
        <div className="h-[env(safe-area-inset-top)] lg:hidden" />

        {/* «Язычок» для открытия меню на мобильных.
            При открытом меню прячется вверх анимацией. */}
        <header
  className={`absolute top-0 left-1/2 -translate-x-1/2 
              z-[1000] hidden max-lg:flex items-center
              transition-transform duration-300
              ${isOpen ? "-translate-y-full" : "translate-y-0"}`}
>
 

          <button
            type="button"
            onClick={openMenu}
            aria-label="Открыть меню"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className="w-[clamp(150px,26vw,200px)] h-8 bg-white/30 border border-white/20 backdrop-blur-xl border-t-0 rounded-b-full active:bg-white/40 focus:outline-none focus:ring-0"
          >
            <svg
              width="70"
              height="28"
              viewBox="0 0 60 24"
              fill="none"
              className="mx-auto  text-white/10 mt-[-2px]"
              aria-hidden="true"
            >
              <path
                d="M3 6h50M3 12h50M3 18h50"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* Основная область контента. Прокручивается, имеет мягкий fade-скролл через .scrollbar-fade */}
        <main className={mainClassName}>
          <div className="relative min-h-full w-full">
            <AnimatePresence mode="wait">
              {outlet ? (
                <motion.div
                  key={pathname}
                  className="absolute inset-0"
                  style={{ transformOrigin: "50% 25%" }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    transition: {
                      duration: 0.45,
                      ease: [0.16, 1, 0.3, 1],
                    },
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.97,
                    transition: {
                      duration: 0.28,
                      ease: [0.4, 0, 0.2, 1],
                    },
                  }}
                >
                  {outlet}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>

        {/* Нижний safe-area отступ (iOS home indicator) — только на мобильных */}
        <div className="h-[env(safe-area-inset-bottom)] lg:hidden" />
      </div>
    </div>
  );
}
