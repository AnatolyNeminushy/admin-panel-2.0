import { useMemo, useCallback, memo, useId } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

/**
 * Диаграмма популярности категорий заказов + краткие KPI.
 *
 * Зачем это компоненту:
 * - Визуализируем вклад категорий в общую сумму заказов (понятный «пирог»).
 * - Рядом показываем «живые» показатели: повторные заказы/брони и топ-блюдо.
 * - Адаптивная вёрстка: на узких экранах легенда уходит вниз, на широких — в боковую колонку.
 *
 * Современные практики (актуально на 2025):
 * - Типобезопасные входные данные и нормализация (боремся с null/undefined и строковыми числами).
 * - React hooks: useMemo/useCallback для вычислений/обработчиков, memo для легенды.
 * - useId вместо «хардкода» id — корректная доступность в рамках дерева React 18+.
 * - Без устаревших API: нет findDOMNode, componentWill*, addListener и т.п.
 * - Разметка с aria-атрибутами: озвучиваем диаграмму и легенду, скрыто проговариваем проценты.
 *
 * Подсказки для будущего читателя:
 * - Цвета диаграммы задаём массивом — если категорий больше, цвета будут «зациклены».
 * - ResponsiveContainer тянет SVG по контейнеру, поэтому высоту контролируем через aspect-ratio.
 * - Tooltip от Recharts — это «визуальный» тултип; для скринридеров даём sr-only строку.
 */

const COLORS = ["#B8E986", "#2AD3C3", "#7CBF8E", "#1A7A7C", "#0D4E56"] satisfies ReadonlyArray<string>;

/** Аккуратно форматируем целые числа по русской локали. */
const formatInt = (value: number | string): string =>
  new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(Number(value) || 0)));

interface HighlightDish {
  name: string;
  count: number | string;
}

interface Highlights {
  /** Сколько заказов от повторных гостей */
  repeatOrders?: number | string;
  /** Сколько повторных броней */
  repeatReserves?: number | string;
  /** Самое популярное блюдо (имя + сколько раз заказывали) */
  topDish?: HighlightDish | null;
}

type HighlightsResolved = {
  repeatOrders: number;
  repeatReserves: number;
  topDish: { name: string; count: number } | null;
};

const DEFAULT_HIGHLIGHTS: Readonly<HighlightsResolved> = {
  repeatOrders: 0,
  repeatReserves: 0,
  topDish: null,
};

type PieDatum = {
  name: string;
  value: number;
};

interface RightLegendProps {
  data: PieDatum[];
  total: number;
}

/**
 * Боковая/нижняя легенда: цветные метки + прогресс-бар доли на ≥ xl.
 * Неочевидно:
 * - Прогресс-бар скрываем на мобильных (экономим вертикаль), оставляя проценты в подписи.
 * - Для доступности есть sr-only строка «X из Y (Z%)».
 */
const RightLegend = memo(function RightLegend({ data, total }: RightLegendProps) {
  const totalSafe = total > 0 ? total : 0;

  return (
    <ul
      className="
        w-full
        flex flex-wrap gap-3
        xl:flex-col xl:gap-0 xl:space-y-3
        xl:flex-1 xl:pl-6
        justify-center
      "
      aria-label="Легенда категорий по заказам"
      role="list"
    >
      {data.map((item, i) => {
        const val = Number(item.value) || 0;
        const part = totalSafe ? Math.min((val / totalSafe) * 100, 100) : 0;
        const percentLabel = totalSafe ? `${Math.round(part)}%` : "0%";
        const color = COLORS[i % COLORS.length];

        return (
          <li
            key={`${item.name}-${i}`}
            className="inline-flex items-center gap-2 xl:flex xl:items-center"
            role="listitem"
          >
            <span
              className="inline-block w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <div className="min-w-0 xl:flex-1">
              <div className="text-white/60 truncate text-body flex items-center gap-2" title={item.name}>
                <span className="truncate">{item.name}</span>
                <span className="text-white/40 text-body shrink-0">{percentLabel}</span>
              </div>

              {/* Полоса прогресса показывается только на ≥ xl */}
              <div className="hidden xl:block">
                <div className="h-1.5 rounded bg-white/10 overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded" style={{ width: `${part}%`, backgroundColor: color }} />
                </div>
              </div>

              <div className="sr-only">
                {formatInt(val)} из {formatInt(totalSafe)} ({part.toFixed(1)}%)
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
});

export interface OrdersPieChartProps {
  /** Сырые данные (имя категории/число может прийти строкой/null) */
  data?: Array<{ name?: string | null; value?: number | string | null }>;
  /** KPI-плашки (могут приходить как строки и/или быть пустыми) */
  highlights?: Highlights | null;
}

export default function OrdersPieChart(props: OrdersPieChartProps) {
  const { data = [], highlights = DEFAULT_HIGHLIGHTS } = props;

  /** Нормализуем KPI: приводим к числам, фильтруем мусор. */
  const normalizedHighlights: HighlightsResolved = useMemo(() => {
    const repeatOrders = Math.max(0, Number(highlights?.repeatOrders) || 0);
    const repeatReserves = Math.max(0, Number(highlights?.repeatReserves) || 0);

    const src = highlights?.topDish;
    const topDish =
      src && src.name
        ? { name: String(src.name), count: Math.max(0, Number(src.count) || 0) }
        : null;

    return { repeatOrders, repeatReserves, topDish };
  }, [highlights]);

  /** Нормализуем данные диаграммы: name → trimmed string, value → non-negative number. */
  const safeData: PieDatum[] = useMemo(
    () =>
      data
        .map((item) => ({
          name: String(item?.name ?? "").trim(),
          value: Math.max(0, Number(item?.value) || 0),
        }))
        .filter((item): item is PieDatum => item.name.length > 0 && Number.isFinite(item.value)),
    [data]
  );

  /** Сумма значений для расчёта долей. */
  const total = useMemo(() => safeData.reduce((sum, item) => sum + (Number(item.value) || 0), 0), [safeData]);

  /** Форматтер тултипа Recharts: [значение, подпись]. */
  const tooltipFormatter = useCallback(
    (value: unknown, name: unknown) => [formatInt(value as number | string), String(name)],
    []
  );

  /** Доступный заголовок диаграммы без «хардкода» id. */
  const titleId = useId();

  if (safeData.length === 0) {
    return (
      <div className="p-[10%] text-center text-white/30" role="status" aria-live="polite">
        Нет данных для построения диаграммы
      </div>
    );
  }

  const { repeatOrders, repeatReserves, topDish } = normalizedHighlights;

  return (
    <div className="w-full rounded-3xl">
      {/* Плашки метрик */}
      <div className="flex flex-wrap gap-4 mb-4 text-body rounded-3xl shadowCart">
        {/* Повторные гости */}
        <div className="flex-1 min-w-[220px] p-4">
          <div className="text-body text-white/50 mb-2">Повторные гости</div>
          <div className="flex flex-wrap items-baseline gap-4 pl-1">
            <div>
              <span className="text-h3 font-medium text-white/90">{formatInt(repeatOrders)}</span>
              <span className="text-body ml-2 text-white/80">заказов</span>
            </div>
            <div className="pl-4">
              <span className="text-h3 font-medium text-white/90">{formatInt(repeatReserves)}</span>
              <span className="text-body ml-2 text-white/70">броней</span>
            </div>
          </div>
        </div>

        {/* Хит блюд */}
        <div className="flex-1 min-w-[220px] p-4">
          <div className="text-body text-white/50 mb-2">Хит блюд</div>
          <div className="text-h4 font-medium text-white/90 pl-1">
            {topDish ? topDish.name : "Нет данных"}
          </div>
          <div className="text-body text-white/30 mt-1">
            {topDish ? `заказывали ${formatInt(topDish.count)} раз` : "В истории заказов пока нет данных"}
          </div>
        </div>
      </div>

      {/* Диаграмма + легенда (перелом на xl для соответствия классам) */}
      <section
        className="
          flex flex-col xl:flex-row xl:items-center
          p-4 rounded-3xl
          flex-1
          min-h-[clamp(320px,70vw,400px)]
        "
      >
        {/* Диаграмма:
           - До xl: занимает всю ширину и сохраняет соотношение сторон (aspect-square).
           - На xl+: выделяем разумную ширину, остальное — под легенду. */}
        <div className="order-1 w-full aspect-square mx-auto mb-10 max-w-[270px] md:max-w-[300px] xl:max-w-none xl:mx-0 xl:w-[clamp(300px,38vw,57%)]">
          <h2 id={titleId} className="font-medium text-center lg:text-left text-white/40 text-body mb-2">
            Что заказывают чаще всего
          </h2>

          <ResponsiveContainer width="100%" height="100%">
            <PieChart role="img" aria-labelledby={titleId}>
              <Pie
                data={safeData}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="80%"
                startAngle={90}
                endAngle={-270}
                paddingAngle={2}
                isAnimationActive={false}
                stroke="none"
              >
                {safeData.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={COLORS[i % COLORS.length]}
                    stroke="none"
                    style={{ outline: "none" }}
                    tabIndex={-1}
                  />
                ))}
              </Pie>

              <Tooltip cursor={{ opacity: 0.1 }} formatter={tooltipFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Легенда:
            — снизу (full width) до xl,
            — справа на xl+ */}
        <div className="order-2 xl:mt-0 xl:ml-6 w-full xl:w-[52%]">
          <RightLegend data={safeData} total={total} />
        </div>
      </section>
    </div>
  );
}
