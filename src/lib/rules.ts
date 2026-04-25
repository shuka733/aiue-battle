import type { Attack, PrivateWordState, RevealResult, SlotValue } from "../types";

export const SLOT_COUNT = 10;

export const HIRAGANA_BOARD_ROWS = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", "ゆ", "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "を", "ん", "ー"],
] as const;

export const HIRAGANA_ATTACK_LETTERS = HIRAGANA_BOARD_ROWS.flat();

const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: "あ",
  ぃ: "い",
  ぅ: "う",
  ぇ: "え",
  ぉ: "お",
  ゃ: "や",
  ゅ: "ゆ",
  ょ: "よ",
  っ: "つ",
  ゎ: "わ",
  ゕ: "か",
  ゖ: "け",
};

const ATTACK_LETTER_SET = new Set<string>(HIRAGANA_ATTACK_LETTERS);

export function katakanaToHiragana(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30fa) {
        return String.fromCharCode(code - 0x60);
      }
      return char;
    })
    .join("");
}

export function normalizeWord(value: string): string {
  const withoutSpaces = value.replace(/[\s\u3000]/g, "");
  const hiragana = katakanaToHiragana(withoutSpaces);
  const withoutMarks = hiragana.normalize("NFD").replace(/[\u3099\u309a]/g, "");

  return Array.from(withoutMarks.normalize("NFC"))
    .map((char) => SMALL_TO_LARGE[char] ?? char)
    .join("");
}

export function validateNormalizedWord(normalized: string): string | null {
  if (normalized.length < 2) {
    return "2文字以上で入力してください。";
  }

  if (normalized.length > SLOT_COUNT) {
    return "10文字以内で入力してください。";
  }

  const invalid = Array.from(normalized).find((char) => !ATTACK_LETTER_SET.has(char));
  if (invalid) {
    return `使える文字はひらがなと長音「ー」です。「${invalid}」は使えません。`;
  }

  return null;
}

export function buildPrivateWord(raw: string): PrivateWordState {
  const normalized = normalizeWord(raw);
  const validationError = validateNormalizedWord(normalized);

  if (validationError) {
    throw new Error(validationError);
  }

  const slots = Array.from(normalized);
  while (slots.length < SLOT_COUNT) {
    slots.push("×");
  }

  return {
    raw,
    normalized,
    slots,
  };
}

export function isEliminated(slots: string[], revealedIndexes: Set<number>): boolean {
  return slots.every((slot, index) => slot === "×" || revealedIndexes.has(index));
}

export function getRevealedIndexes(revealed: SlotValue[]): Set<number> {
  return new Set(
    revealed
      .map((slot, index) => (slot ? index : null))
      .filter((index): index is number => index !== null),
  );
}

export function createRevealResult(
  attack: Attack,
  playerId: string,
  privateWord: PrivateWordState,
  currentRevealed: SlotValue[],
): RevealResult {
  const alreadyRevealed = getRevealedIndexes(currentRevealed);
  const positions = privateWord.slots
    .map((slot, index) => (slot === attack.letter && !alreadyRevealed.has(index) ? index : null))
    .filter((index): index is number => index !== null);

  const afterReveal = new Set(alreadyRevealed);
  positions.forEach((position) => afterReveal.add(position));

  return {
    attackId: attack.id,
    playerId,
    letter: attack.letter,
    positions,
    eliminated: isEliminated(privateWord.slots, afterReveal),
  };
}
