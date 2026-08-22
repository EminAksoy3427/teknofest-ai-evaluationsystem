export const DISPLAY_NAME_MAX_LENGTH = 80;
export const DISPLAY_NAME_MIN_LENGTH = 2;

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function displayNameValidationMessage(value: string): string | null {
  const normalized = normalizeDisplayName(value);
  if (normalized.length === 0) return "Görünen ad boş olamaz.";
  if (normalized.length < DISPLAY_NAME_MIN_LENGTH) {
    return `Görünen ad en az ${DISPLAY_NAME_MIN_LENGTH} karakter olmalıdır.`;
  }
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Görünen ad en fazla ${DISPLAY_NAME_MAX_LENGTH} karakter olabilir.`;
  }
  return null;
}
