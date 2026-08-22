export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RESET_UNAVAILABLE_MESSAGE =
  "Şifre sıfırlama e-postası şu anda gönderilemiyor. Platform henüz bir e-posta teslimatı yapılandırmadı.";

export const EMAIL_CHANGE_UNAVAILABLE_MESSAGE =
  "E-posta değişikliği, doğrulanmış bir e-posta teslimatı gerektirir. Bu ortamda değiştirilemez.";

export function passwordValidationMessage(value: string): string | null {
  if (value.length < AUTH_PASSWORD_MIN_LENGTH) {
    return `Şifre en az ${AUTH_PASSWORD_MIN_LENGTH} karakter olmalıdır.`;
  }
  if (value.length > AUTH_PASSWORD_MAX_LENGTH) {
    return `Şifre en fazla ${AUTH_PASSWORD_MAX_LENGTH} karakter olabilir.`;
  }
  return null;
}

export function confirmPasswordValidationMessage(
  password: string,
  confirmation: string,
): string | null {
  const passwordMessage = passwordValidationMessage(password);
  if (passwordMessage) return passwordMessage;
  if (password !== confirmation) return "Şifreler eşleşmiyor.";
  return null;
}

export function authErrorMessage(error: { code?: string | undefined } | null | undefined): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-posta veya şifre hatalı.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Bu e-posta ile bir hesap zaten var.";
    case "PASSWORD_TOO_SHORT":
      return `Şifre en az ${AUTH_PASSWORD_MIN_LENGTH} karakter olmalıdır.`;
    case "PASSWORD_TOO_LONG":
      return `Şifre en fazla ${AUTH_PASSWORD_MAX_LENGTH} karakter olabilir.`;
    case "RESET_PASSWORD_DISABLED":
      return PASSWORD_RESET_UNAVAILABLE_MESSAGE;
    case "INVALID_TOKEN":
      return "Bağlantı geçersiz veya süresi dolmuş.";
    default:
      return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }
}

export function hasAuthProvider(
  accounts: readonly { providerId: string }[],
  providerId: "credential" | "google",
): boolean {
  return accounts.some((account) => account.providerId === providerId);
}
