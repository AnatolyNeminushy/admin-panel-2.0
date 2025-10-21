// Фон с эффектом Vanta Topology: создаёт живой космос в фоне, не мешая кликам по основному UI.
import { useEffect, useRef, useMemo } from "react";

type HexColor = number;

interface VantaBgProps {
  color?: HexColor;
  backgroundColor?: HexColor;
  /** Подсказка: отключите точки, если нужен «спокойный» фон без лишней динамики. */
  showDots?: boolean;
}

// Внутренний контракт для VANTA, чтобы TypeScript не ругался на глобал.
type VantaInitializer = (options: {
  el: HTMLElement;
  mouseControls: boolean;
  touchControls: boolean;
  gyroControls: boolean;
  minHeight: number;
  minWidth: number;
  scale: number;
  scaleMobile: number;
  color: HexColor;
  backgroundColor: HexColor;
  points: number;
  maxDistance: number;
}) => { destroy: () => void };

declare global {
  interface Window {
    VANTA?: {
      TOPOLOGY?: VantaInitializer;
    };
  }
}

export default function VantaBg({
  color = 0x41dc9a,
  backgroundColor = 0x13214c,
  showDots = true,
}: VantaBgProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const vantaRef = useRef<{ destroy: () => void } | null>(null);

  // Подсказка для будущих правок: меняем количество точек и их «растяжение»,
  // чтобы быстро настроить настроение фона под конкретную страницу.
  const topologySettings = useMemo(
    () => ({
      points: showDots ? 12.0 : 0.0,
      maxDistance: showDots ? 20.0 : 0.0,
    }),
    [showDots]
  );

  useEffect(() => {
    let cancelled = false;

    const init = () => {
      if (cancelled || vantaRef.current || !elementRef.current) return;

      const topology = window.VANTA?.TOPOLOGY;
      if (typeof topology === "function") {
        vantaRef.current = topology({
          el: elementRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 1,
          color,
          backgroundColor,
          points: topologySettings.points,
          maxDistance: topologySettings.maxDistance,
        });
      } else {
        window.setTimeout(init, 50);
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        vantaRef.current?.destroy();
      } catch {
        // Игнорируем: destroy может бросить, если VANTA выгрузили раньше компонента.
      }
      vantaRef.current = null;
    };
  }, [backgroundColor, color, topologySettings]);

  return <div ref={elementRef} className="fixed inset-0 z-0 pointer-events-none" />;
}
