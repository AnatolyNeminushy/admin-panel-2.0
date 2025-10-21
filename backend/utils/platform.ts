/**
 * Утилиты нормализации платформ: приводим пользовательский ввод
 * к ожидаемым коротким кодам и формируем списки эквивалентных значений.
 */
export type NormalizedPlatform = 'tg' | 'vk' | string;

const CYRILLIC_VK = 'вк';

/**
 * Приводит строку к удобному для хранения коду платформы.
 * Допускает латиницу/кириллицу и различные варианты написания.
 */
export const normalizePlatform = (value: unknown): NormalizedPlatform => {
  const s = String(value ?? '').trim().toLowerCase();
  if (['tg', 'telegram', 't.me'].includes(s) || s.startsWith('tg')) return 'tg';
  if (['vk', 'vkontakte', CYRILLIC_VK].includes(s)) return 'vk';
  return s;
};

/**
 * Возвращает набор эквивалентных значений, полезно для SQL-запросов вида WHERE platform IN (...).
 */
export const variantsFor = (value: unknown): string[] => {
  const normalized = normalizePlatform(value);
  if (normalized === 'tg') return ['tg', 'telegram'];
  if (normalized === 'vk') return ['vk', 'vkontakte', CYRILLIC_VK];
  return [normalized];
};
