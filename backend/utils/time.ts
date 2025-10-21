export function normalizeTimeInput(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;

  const value = String(raw).trim();
  if (!value) return null;

  const normalizedValue = value.replace(',', '.');

  // Простые варианты: только часы (например, "12").
  if (/^\d{1,2}$/.test(normalizedValue)) {
    const hours = Number(normalizedValue);
    if (!Number.isNaN(hours) && hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, "0")}:00`;
    }
  }

  // Варианты «часы:минуты» или «часы.минуты».
  if (/^\d{1,2}[:.]\d{1,2}$/.test(normalizedValue)) {
    const [h, m] = normalizedValue.replace('.', ':').split(':');
    const hours = Number(h);
    const minutes = Number(m);
    if (
      !Number.isNaN(hours) &&
      !Number.isNaN(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }

  // Если значение уже в поддерживаемом формате (например, "12:30:00"),
  // оставляем как есть — база справится.
  return normalizedValue.replace('.', ':');
}

