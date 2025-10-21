import pool from "../db";

/**
 * Уровень детализации категорий.
 */
type Level = "category" | "child_category";

/**
 * Метрика для среза: количество или выручка.
 */
type Metric = "count" | "revenue";

/**
 * Строка результата по категориям.
 */
interface OrdersByCategoryRow {
  name: string;
  value: number;
  delta: number | null;
}

/**
 * Тип результата подсчёта повторных сущностей.
 */
interface RepeatCountRow {
  repeat_count: number;
}

/**
 * Тип строки для самой популярной позиции.
 */
interface PopularDishRow {
  name: string | null;
  qty: number | null;
}

/**
 * Возвращает топ-5 категорий/подкатегорий по количеству или выручке
 * за последние N дней, а также дельту к предыдущему аналогичному периоду.
 *
 * @param params.level - уровень детализации: 'category' (по умолчанию) или 'child_category'
 * @param params.metric - метрика: 'count' (по умолчанию) или 'revenue'
 * @param params.days - размер окна в днях (по умолчанию 30; если 0 или не задано — без фильтра по времени)
 * @returns Массив объектов { name, value, delta }
 *
 * Заметки:
 * - Безопасно нормализуем входные параметры $1/$2/$3.
 * - JSON в поле items может быть как объектом, так и массивом — поддерживаем оба формата.
 * - Для некорректных/пустых значений items используем резервный путь и дефолты.
 */
export async function getOrdersByCategoryFromItems(
  params: { level?: Level; metric?: Metric; days?: number } = {}
): Promise<OrdersByCategoryRow[]> {
  const {
    level = "category",
    metric = "count",
    days,
  } = params;

  // Безопасная нормализация входных параметров.
  const safeLevel: Level = level === "child_category" ? "child_category" : "category";
  const safeMetric: Metric = metric === "revenue" ? "revenue" : "count";
  const safeDays =
    typeof days === "number" && Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;

  const sql = `
    WITH source AS (
      SELECT
        o.created_at,
        BTRIM(o.items) AS items_trimmed,
        CASE
          WHEN o.items IS NULL THEN NULL
          WHEN BTRIM(o.items) = '' THEN NULL
          WHEN LEFT(BTRIM(o.items), 1) IN ('{', '[')
            THEN o.items::jsonb
          ELSE NULL
        END AS items_json,
        CASE
          WHEN LEFT(BTRIM(o.items), 1) = '{' THEN 'object'
          WHEN LEFT(BTRIM(o.items), 1) = '[' THEN 'array'
          ELSE NULL
        END AS items_kind
      FROM orders o
      WHERE o.items IS NOT NULL
    ),
    exploded AS (
      SELECT
        s.created_at,
        COALESCE(
          NULLIF(
            TRIM(
              CASE
                WHEN $1 = 'child_category'
                  THEN item.value->'dish'->>'child_category'
                ELSE item.value->'dish'->>'category'
              END
            ),
            ''
          ),
          'Другое'
        ) AS name,
        metrics.qty,
        metrics.price
      FROM source s
      CROSS JOIN LATERAL (
        SELECT value
        FROM jsonb_each(CASE WHEN s.items_kind = 'object' THEN s.items_json ELSE '{}'::jsonb END)
        UNION ALL
        SELECT value
        FROM jsonb_array_elements(CASE WHEN s.items_kind = 'array' THEN s.items_json ELSE '[]'::jsonb END)
      ) AS item(value)
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN raw.qty_text IS NULL THEN 1
            ELSE GREATEST(raw.qty_text::int, 1)
          END AS qty,
          COALESCE(ROUND(raw.price_numeric)::int, 0) AS price
        FROM (
          SELECT
            NULLIF(
              regexp_replace(
                COALESCE(
                  item.value->>'quantity',
                  item.value->>'qty',
                  item.value->'dish'->>'quantity',
                  item.value->'dish'->>'qty',
                  '1'
                ),
                '[^0-9-]',
                '',
                'g'
              ),
              ''
            ) AS qty_text,
            (
              NULLIF(
                REPLACE(
                  regexp_replace(
                    COALESCE(
                      item.value->>'price',
                      item.value->'dish'->>'price',
                      '0'
                    ),
                    '[^0-9.,-]',
                    '',
                    'g'
                  ),
                  ',',
                  '.'
                ),
                ''
              )
            )::numeric AS price_numeric
        ) AS raw
      ) AS metrics
    ),
    cur AS (
      SELECT
        name,
        CASE
          WHEN $2 = 'revenue'
            THEN COALESCE(ROUND(SUM((e.qty::numeric) * (e.price::numeric))), 0)
          ELSE COALESCE(SUM(e.qty)::numeric, 0)
        END::int AS cnt
      FROM exploded e
      WHERE ($3::int) <= 0
        OR e.created_at >= now() - (($3::int) * INTERVAL '1 day')
      GROUP BY 1
    ),
    prev AS (
      SELECT
        name,
        CASE
          WHEN $2 = 'revenue'
            THEN COALESCE(ROUND(SUM((e.qty::numeric) * (e.price::numeric))), 0)
          ELSE COALESCE(SUM(e.qty)::numeric, 0)
        END::int AS cnt
      FROM exploded e
      WHERE ($3::int) > 0
        AND e.created_at >= now() - ((2 * ($3::int)) * INTERVAL '1 day')
        AND e.created_at <  now() - (($3::int) * INTERVAL '1 day')
      GROUP BY 1
    ),
    merged AS (
      SELECT
        COALESCE(c.name, p.name) AS name,
        COALESCE(c.cnt, 0) AS cur_cnt,
        COALESCE(p.cnt, 0) AS prev_cnt
      FROM cur c
      FULL JOIN prev p USING (name)
    )
    SELECT
      name,
      cur_cnt AS value,
      CASE
        WHEN prev_cnt = 0 THEN NULL
        ELSE ROUND(100.0 * (cur_cnt - prev_cnt) / NULLIF(prev_cnt, 0), 0)::int
      END AS delta
    FROM merged
    WHERE cur_cnt > 0
    ORDER BY value DESC, name
    LIMIT 5;
  `;

  const { rows } = await pool.query<OrdersByCategoryRow>(sql, [safeLevel, safeMetric, safeDays]);
  return rows;
}

/**
 * Подсчитывает количество повторных заказов (по телефонам),
 * т.е. сверх первого заказа. Возвращает целое число.
 */
export async function getRepeatOrdersCount(): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(cnt - 1), 0)::int AS repeat_count
    FROM (
      SELECT COUNT(*) AS cnt
      FROM orders
      WHERE phone IS NOT NULL AND BTRIM(phone) <> ''
      GROUP BY phone
      HAVING COUNT(*) > 1
    ) sub;
  `;

  const { rows } = await pool.query<RepeatCountRow>(sql);
  return rows[0]?.repeat_count ?? 0;
}

/**
 * Подсчитывает количество повторных бронирований (по телефонам),
 * т.е. сверх первого бронирования. Возвращает целое число.
 */
export async function getRepeatReservesCount(): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(cnt - 1), 0)::int AS repeat_count
    FROM (
      SELECT COUNT(*) AS cnt
      FROM reservations
      WHERE phone IS NOT NULL AND BTRIM(phone) <> ''
      GROUP BY phone
      HAVING COUNT(*) > 1
    ) sub;
  `;

  const { rows } = await pool.query<RepeatCountRow>(sql);
  return rows[0]?.repeat_count ?? 0;
}

/**
 * Возвращает самую популярную позицию по заказам и количеству.
 * Если данных нет — вернёт null.
 *
 * Заметки:
 * - Поддерживается JSON в items (объект/массив) и текстовый формат (через split).
 * - Нормализуем количество и имена позиций; учитываем нечисловые символы.
 */
export async function getMostPopularDish(): Promise<{ name: string; count: number } | null> {
  const sql = `
    WITH source AS (
      SELECT
        BTRIM(o.items) AS items_trimmed,
        CASE
          WHEN o.items IS NULL THEN NULL
          WHEN BTRIM(o.items) = '' THEN NULL
          WHEN LEFT(BTRIM(o.items), 1) IN ('{', '[')
            THEN o.items::jsonb
          ELSE NULL
        END AS items_json,
        CASE
          WHEN LEFT(BTRIM(o.items), 1) = '{' THEN 'object'
          WHEN LEFT(BTRIM(o.items), 1) = '[' THEN 'array'
          ELSE NULL
        END AS items_kind
      FROM orders o
      WHERE o.items IS NOT NULL
    ),
    json_items AS (
      SELECT
        NULLIF(
          TRIM(
            COALESCE(
              item.value->>'title',
              item.value->>'name',
              item.value->'dish'->>'title',
              item.value->'dish'->>'name'
            )
          ),
          ''
        ) AS name,
        CASE
          WHEN raw.qty_text IS NULL THEN 1
          ELSE GREATEST(raw.qty_text::int, 1)
        END AS qty
      FROM source s
      CROSS JOIN LATERAL (
        SELECT value
        FROM jsonb_each(CASE WHEN s.items_kind = 'object' THEN s.items_json ELSE '{}'::jsonb END)
        UNION ALL
        SELECT value
        FROM jsonb_array_elements(CASE WHEN s.items_kind = 'array' THEN s.items_json ELSE '[]'::jsonb END)
      ) AS item(value)
      CROSS JOIN LATERAL (
        SELECT
          NULLIF(
            regexp_replace(
              COALESCE(
                item.value->>'quantity',
                item.value->>'qty',
                item.value->'dish'->>'quantity',
                item.value->'dish'->>'qty',
                '1'
              ),
              '[^0-9]',
              '',
              'g'
            ),
            ''
          ) AS qty_text
      ) AS raw
    ),
    text_items AS (
      SELECT
        NULLIF(TRIM(regexp_replace(val, '\\s{2,}', ' ', 'g')), '') AS name,
        1 AS qty
      FROM source s
      CROSS JOIN LATERAL regexp_split_to_table(s.items_trimmed, E'[\\n;,]+') AS val
      WHERE s.items_kind IS NULL
    ),
    combined AS (
      SELECT LOWER(name) AS normalized_name, name, qty
      FROM (
        SELECT name, qty FROM json_items
        UNION ALL
        SELECT name, qty FROM text_items
      ) AS all_items
      WHERE name IS NOT NULL
    )
    SELECT MIN(name) AS name, SUM(qty)::int AS qty
    FROM combined
    GROUP BY normalized_name
    ORDER BY SUM(qty) DESC, MIN(name)
    LIMIT 1;
  `;

  const { rows } = await pool.query<PopularDishRow>(sql);
  const top = rows[0];
  if (!top?.name) return null;

  return { name: top.name, count: Number(top.qty) || 0 };
}
