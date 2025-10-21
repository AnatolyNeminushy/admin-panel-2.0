import { useMemo, useState, useRef, useLayoutEffect, type PointerEvent } from "react";

/**
 * Компонент: «Гладкий линейный график» (SVG) с area-заливкой, адаптивной высотой и подсказкой по Pointer Events.
 *
 * Что делает:
 * - Рендерит временной ряд (по дням) с плавной кривой (кубические Безье) и soft-заливкой под линией.
 * - Адаптирует высоту к ширине контейнера по степенному закону — график остаётся читабельным на узких экранах.
 * - Работает устойчиво с длинными рядами: триммит пустые края и даунсэмплит без искажения тренда.
 * - Показывает краткие метрики (максимум за день + опциональный «пик», например почасовой максимум).
 *
 * Почему так:
 * - Фиксируем ширину viewBox по оси X (BASE_WIDTH), а фактическую ширину тянем через width="100%".
 *   Это стабилизирует расчёт координат, типографику и отступы, а также упрощает масштабирование.
 * - Для сетки Y используем «эффективный» максимум (квантиль), а геометрию линии — по реальному максимуму.
 *   Так сетка не «ломается» от выбросов, но линия никогда не обрежется.
 * - Даунсэмплинг суммирует значения внутри окна и берёт метку времени из середины окна — визуально честный тренд.
 *
 * На что обратить внимание (неочевидные моменты):
 * - normX/normY — чистые преобразователи «данные → пиксели», зависят только от текущей геометрии.
 * - Шаг тиков подбирается «красивым» правилом 1/2/5·10^n — подписей легко читать при любых диапазонах.
 * - Ховер/подсказка построены на Pointer Events (единый стандарт для мыши/тача/пера, актуально в 2025).
 * - Вёрстка подписей осей — поверх SVG абсолютными span, чтобы шрифт не «плыл» при масштабировании.
 */

const MAX_BOX_LABEL = "Максимум за 1 день";
const PEAK_BOX_LABEL = "Пик заказов по времени";
const NO_DATA_TEXT = "Нет данных";

// === Визуальные/адаптивные константы  ===
const DESKTOP_BASE_WIDTH = 560;
const MOBILE_BASE_WIDTH = 300;

const viewportWidth =
  typeof window === "undefined" ? DESKTOP_BASE_WIDTH : window.innerWidth;

// Фиксированный viewBox по X (на основании текущей ширины вьюпорта)
const BASE_WIDTH = viewportWidth > 600 ? DESKTOP_BASE_WIDTH : MOBILE_BASE_WIDTH;

const MIN_CONTAINER_W = 280;         // ниже считаем ширину как минимум 280
const HEIGHT_EXPONENT = 0.2;         // агрессивность роста высоты при сужении
const HEIGHT_MAX_MULTIPLIER = 2.2;   // верхняя «скоба» роста высоты относительно базовой
const SCALE_MIN = 0.85;              // нижняя граница масштабирования шрифтов/отступов
const SCALE_MAX = 1.8;               // верхняя граница масштабирования шрифтов/отступов
const GRID_TICKS = 3;                // количество шагов по сетке Y
const MAX_X_TICKS = 4;               // максимум подписей по X
const Q_EFFECTIVE = 0.9;             // квантиль для «эффективного» максимума сетки

const nfRU = new Intl.NumberFormat("ru-RU");

export interface ChartDatum {
  dayISO?: string;
  day?: string;
  sum?: number;
  count?: number;
  date?: Date | string | number;
  [key: string]: number | string | Date | undefined | null;
}

export interface PeakInfo {
  value: string;
  subtitle?: string;
  label?: string;
  hour?: number;
  count?: number;
}

interface SmoothChartProps {
  data: ChartDatum[];
  /** Ключ значения по оси Y. Для денег подходит "sum", для количества — "count". */
  yKey?: string;
  /** Базовая высота при ширине BASE_WIDTH (реальная высота рассчитывается адаптивно). */
  height?: number;
  /**
   * Включить робастное масштабирование сетки (типы выбираются по квантилю).
   * Линия при этом тянется по реальному максимуму — без клиппинга графика.
   */
  robustScale?: boolean;
  /** Дополнительный «пик» (например, почасовой максимум) — для второй карточки метрик. */
  peakInfo?: PeakInfo | null;
}

interface HoverState {
  i: number;
  x: number;
  y: number;
}

interface MetricBox {
  key: string;
  title: string;
  primary: string;
  secondary?: string;
}

const formatNumber = (value: number): string => nfRU.format(value);

/** Нормализация чисел: аккуратно приводим к finite-значению. */
const toNumber = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

/**
 * Тримминг данных: отсекаем ведущие/хвостовые нули с «припуском».
 * Убираем пустые края, оставляя контекст.
 */
const trimData = (series: ChartDatum[], yKey: string): ChartDatum[] => {
  if (series.length <= 3) return series;
  const first = series.findIndex((item) => toNumber(item[yKey]) > 0);
  if (first === -1) return series;
  const lastRev = [...series].reverse().findIndex((item) => toNumber(item[yKey]) > 0);
  const last = series.length - 1 - lastRev;
  const from = Math.max(0, first - 2);
  const to = Math.min(series.length, last + 3);
  return series.slice(from, to);
};

/**
 * Даунсэмплинг: агрегируем длинные ряды до умеренного числа точек.
 * Сумму по Y считаем по окну, метку времени берём из середины окна.
 */
const downsample = (series: ChartDatum[], yKey: string, maxPoints = 180): ChartDatum[] => {
  if (series.length <= maxPoints) return series;
  const bucket = Math.ceil(series.length / maxPoints);
  const result: ChartDatum[] = [];
  for (let i = 0; i < series.length; i += bucket) {
    const chunk = series.slice(i, i + bucket);
    const mid = chunk[Math.floor(chunk.length / 2)] ?? chunk[0];
    const aggregatedValue = chunk.reduce((sum, current) => sum + toNumber(current[yKey]), 0);
    result.push({ ...mid, [yKey]: aggregatedValue });
  }
  return result;
};

/** Строим карточки метрик. */
const buildMetrics = (
  series: ChartDatum[],
  yKey: string,
  peakInfo?: PeakInfo | null
): MetricBox[] => {
  if (!series.length) return [];
  const toVal = (it: ChartDatum) => toNumber(it[yKey]);
  const positives = series.filter((it) => toVal(it) > 0);
  const anySorted = [...series].sort((a, b) => toVal(b) - toVal(a));
  const top = positives.length ? positives.sort((a, b) => toVal(b) - toVal(a))[0] : anySorted[0];
  const topValue = toVal(top);

  const metrics: MetricBox[] = [
    {
      key: "max",
      title: MAX_BOX_LABEL,
      primary: yKey === "sum" ? `${formatNumber(topValue)} ₽` : `${formatNumber(topValue)}`,
      secondary: top?.day ? String(top.day) : NO_DATA_TEXT,
    },
  ];

  if (peakInfo?.value) {
    metrics.push({
      key: "peak",
      title: peakInfo.label ?? PEAK_BOX_LABEL,
      primary: peakInfo.value,
      secondary: peakInfo.subtitle,
    });
  }

  return metrics;
};

/** «Красивый» шаг для тиков: 1/2/5 · 10^n. */
const getNiceStep = (rawStep: number): number => {
  if (rawStep <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const bases = [1, 2, 5, 10] as const;
  const candidate = bases.find((b) => b * pow >= rawStep) ?? rawStep;
  return candidate * pow;
};

export default function SmoothChart({
  data,
  yKey = "sum",
  height = 220,
  robustScale = true,
  peakInfo = null,
}: SmoothChartProps) {
  // --- Адаптив: измеряем ширину контейнера через ResizeObserver ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState<number>(BASE_WIDTH);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined" || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? BASE_WIDTH;
      setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- Геометрия и масштабирование ---
  const safeW = Math.max(MIN_CONTAINER_W, containerW);
  const heightGrow = (BASE_WIDTH / safeW) ** HEIGHT_EXPONENT;
  const HEIGHT = Math.round(
    Math.min(height * HEIGHT_MAX_MULTIPLIER, Math.max(height, height * heightGrow))
  );
  const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, safeW / BASE_WIDTH));

  const isWide =
    typeof window !== "undefined" ? window.matchMedia("(min-width: 600px)").matches : false;

  const padding = {
    t: 40,
    r: 20,
    b: Math.round(28 * scale),
    l: Math.round((isWide ? 50 : 40) * scale),
  };

  const plotWidth = BASE_WIDTH - padding.l - padding.r;
  const plotHeight = HEIGHT - padding.t - padding.b;

  // --- Подготовка данных ---
  const trimmed = useMemo(() => (Array.isArray(data) ? trimData(data, yKey) : []), [data, yKey]);
  const seriesRaw = useMemo(
    () => (trimmed.length ? downsample(trimmed, yKey) : []),
    [trimmed, yKey]
  );

  // Для Безье и подписей удобнее >= 3 точек; при малом наборе дублируем.
  const series = useMemo(() => {
    if (seriesRaw.length >= 3) return seriesRaw;
    if (seriesRaw.length === 2) return [seriesRaw[0], seriesRaw[0], seriesRaw[1]];
    if (seriesRaw.length === 1) return [seriesRaw[0], seriesRaw[0], seriesRaw[0]];
    return seriesRaw;
  }, [seriesRaw]);

  const values = useMemo(
    () => series.map((item) => toNumber(item[yKey])).sort((a, b) => a - b),
    [series, yKey]
  );
  const nonZero = useMemo(() => values.filter((v) => v > 0), [values]);
  const baseValues = nonZero.length ? nonZero : values;

  const quantile = (p: number): number => {
    if (!baseValues.length) return 0;
    const idx = Math.min(baseValues.length - 1, Math.floor(p * (baseValues.length - 1)));
    return baseValues[idx];
  };

  const rawMax = values.at(-1) ?? 1;

  // Эффективный максимум для сетки и реальный максимум для геометрии линии.
  const effectiveMaxForGrid = robustScale
    ? Math.max(1, quantile(Q_EFFECTIVE))
    : Math.max(1, rawMax);
  const yMax = Math.max(1, rawMax);

  // --- Тики/ось Y ---
  const ticks = useMemo(() => {
    const rawStep = effectiveMaxForGrid / GRID_TICKS;
    const niceStep = getNiceStep(rawStep || 0);
    return Array.from({ length: GRID_TICKS + 1 }, (_, i) => Math.round(niceStep * i));
  }, [effectiveMaxForGrid]);

  // --- Нормировки координат ---
  const normX = useMemo<(index: number) => number>(() => {
    const denominator = Math.max(1, series.length - 1);
    return (index: number) => padding.l + (index / denominator) * plotWidth;
  }, [padding.l, plotWidth, series.length]);

  const normY = useMemo<(value: number) => number>(() => {
    return (value: number) => padding.t + (1 - value / yMax) * plotHeight;
  }, [padding.t, plotHeight, yMax]);

  // --- Геометрия линий и площади ---
  const pathD = useMemo(() => {
    if (series.length === 0) return "";
    if (series.length === 1) {
      const x = normX(0);
      const y = normY(toNumber(series[0][yKey]));
      // Минимальный сегмент, чтобы линия не исчезала
      return `M${x} ${y} L${x + 0.01} ${y}`;
    }
    let path = "";
    for (let i = 0; i < series.length; i += 1) {
      const currentValue = toNumber(series[i][yKey]);
      const x = normX(i);
      const y = normY(currentValue);
      if (i === 0) {
        path += `M${x} ${y}`;
      } else {
        const prevX = normX(i - 1);
        const prevY = normY(toNumber(series[i - 1][yKey]));
        const cx = prevX + (x - prevX) / 2; // симметричные контрольные точки
        path += ` C${cx} ${prevY}, ${cx} ${y}, ${x} ${y}`;
      }
    }
    return path;
  }, [normX, normY, series, yKey]);

  const areaD = useMemo(() => {
    if (series.length === 0 || !pathD) return "";
    const lastX = normX(series.length - 1);
    const baseY = normY(0);
    return `${pathD} L${lastX} ${baseY} L${normX(0)} ${baseY} Z`;
  }, [normX, normY, pathD, series.length]);

  // --- Ховер/подсказка ---
  const [hover, setHover] = useState<HoverState | null>(null);
  const stepX = Math.max(1, Math.ceil(series.length / MAX_X_TICKS));

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (series.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = rect.width / BASE_WIDTH;
    const xInSvg = (event.clientX - rect.left) / scaleX;
    const relativeX = xInSvg - padding.l;
    const ratio = Math.max(0, Math.min(1, relativeX / plotWidth));
    const index = Math.round(ratio * Math.max(0, series.length - 1));
    setHover({ i: index, x: normX(index), y: normY(toNumber(series[index][yKey])) });
  };

  const onLeave = () => setHover(null);

  const metrics = useMemo(() => buildMetrics(series, yKey, peakInfo), [series, yKey, peakInfo]);

  if (series.length === 0) {
    return <div className="text-white/30 text-center p-8">{NO_DATA_TEXT}</div>;
  }

  return (
    <div className="flex flex-col gap-10">
      <div ref={containerRef} className="relative w-full rounded-3xl p-4 sm:p-6">
        <svg
          width="100%"
          viewBox={`0 0 ${BASE_WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="График динамики по дням"
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          className="block touch-none"
        >
          {/* Прозрачный фон для стабильного ховера по всей области */}
          <rect x={0} y={0} width={BASE_WIDTH} height={HEIGHT} fill="transparent" />

          {/* Горизонтальные линии сетки */}
          <g>
            {ticks.map((tick) => {
              const y = normY(tick);
              const isZero = tick === 0;
              return (
                <line
                  key={`y-${tick}`}
                  x1={padding.l}
                  x2={BASE_WIDTH - padding.r}
                  y1={y}
                  y2={y}
                  stroke={isZero ? "#d1d5db" : "#e5e7eb"}
                  strokeDasharray={isZero ? "0" : "4 4"}
                />
              );
            })}
          </g>

          {/* Градиент заливки под линией */}
          <defs>
            <linearGradient id="lineFill2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#17e1b1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#17e1b1" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Площадь под кривой */}
          {areaD && <path d={areaD} fill="url(#lineFill2)" />}

          {/* Основная линия */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#17e1b1"
              strokeWidth={Math.max(2, Math.round(3 * scale))}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Ховер-линия и маркер */}
          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padding.t}
                y2={padding.t + plotHeight}
                stroke="rgba(0,0,0,0.15)"
              />
              <circle cx={hover.x} cy={hover.y} r={Math.max(3, Math.round(4 * scale))} fill="#17e1b1" />

              {/* Подсказка: фиксируем ширину/высоту, ограничиваем выход за правый край */}
              {(() => {
                const boxW = Math.round(122 * scale);
                const boxH = Math.round(46 * scale);
                const boxX = Math.min(hover.x + 8, BASE_WIDTH - Math.round(130 * scale));
                const textX = Math.min(
                  hover.x + Math.round(18 * scale),
                  BASE_WIDTH - Math.round(120 * scale)
                );
                const boxY = padding.t + Math.round(8 * scale);

                return (
                  <>
                    <rect
                      x={boxX}
                      y={boxY}
                      width={boxW}
                      height={boxH}
                      rx={Math.round(8 * scale)}
                      fill="rgba(0,0,0,0.75)"
                    />
                    <text
                      x={textX}
                      y={padding.t + Math.round(26 * scale)}
                      fontSize={Math.round(11 * scale)}
                      fill="#fff"
                    >
                      {series[hover.i].day}
                    </text>
                    <text
                      x={textX}
                      y={padding.t + Math.round(44 * scale)}
                      fontSize={Math.round(12 * scale)}
                      fill="#fff"
                      fontWeight={600}
                    >
                      {formatNumber(toNumber(series[hover.i][yKey]))}
                      {yKey === "sum" ? " ₽" : ""}
                    </text>
                  </>
                );
              })()}
            </>
          )}
        </svg>

        {/* Подписи осей: отдельный HTML-слой поверх SVG для чёткой типографики */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {ticks.map((tick) => {
            const rawY = normY(tick);
            const clampedY = Math.max(
              padding.t + 8,
              Math.min(rawY, HEIGHT - padding.b - 8)
            );
            const topPercent = (clampedY / HEIGHT) * 100;
            const leftPx = Math.max(padding.l, 12);
            const leftPercent = (leftPx / BASE_WIDTH) * 100;
            return (
              <span
                key={`ylabel-${tick}`}
                className="absolute select-none"
                style={{
                  top: `${topPercent}%`,
                  left: `calc(${leftPercent}% - 8px)`,
                  transform: "translate(-100%, -50%)",
                  fontSize: "14px",
                  lineHeight: "1",
                  color: "#6b7280",
                }}
              >
                {formatNumber(tick)}
              </span>
            );
          })}

          {series.map((point, index) => {
            if (index % stepX !== 0 && index !== series.length - 1) return null;
            const rawX = normX(index);
            const clampedX = Math.max(
              padding.l + 12,
              Math.min(rawX, BASE_WIDTH - padding.r - 12)
            );
            const xPercent = (clampedX / BASE_WIDTH) * 100;
            const baselinePx = HEIGHT - Math.round(8 * scale);
            const baselinePercent = (baselinePx / HEIGHT) * 100;
            return (
              <span
                key={`x-${point.dayISO ?? index}`}
                className="absolute select-none whitespace-nowrap"
                style={{
                  top: `calc(${baselinePercent}% - 2px)`,
                  left: `${xPercent}%`,
                  transform: "translate(-50%, 0)",
                  fontSize: "14px",
                  lineHeight: "1",
                  color: "#6b7280",
                }}
              >
                {point.day}
              </span>
            );
          })}
        </div>
      </div>

      {/* Метрики под графиком — адаптивная сетка без «дыр» (auto-fit/minmax) */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 rounded-3xl shadowCart">
          {metrics.map((metric) => (
            <div key={metric.key} className="h-full min-w-0 p-4">
              <div className="mb-2 text-body text-white/50">{metric.title}</div>
              <div className="flex flex-col gap-1">
                <span className="truncate text-h3 font-medium text-white/90 pl-1">
                  {metric.primary}
                </span>
                {metric.secondary && (
                  <span className="break-words text-body text-white/40 pl-1">
                    {metric.secondary}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
