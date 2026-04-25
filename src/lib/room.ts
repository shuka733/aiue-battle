export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_RETRY_LIMIT = 10;

export function generateRoomCode(): string {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(ROOM_CODE_LENGTH, "0");
}

export function normalizeRoomCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(value: string): boolean {
  return new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(value);
}

export function isUnavailableRoomCodeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: string }).type === "unavailable-id"
  );
}
