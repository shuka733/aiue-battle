import { describe, expect, it } from "vitest";
import {
  buildPrivateWord,
  createRevealResult,
  normalizeWord,
  validateNormalizedWord,
} from "./rules";
import type { Attack } from "../types";

describe("normalizeWord", () => {
  it("removes dakuten and handakuten", () => {
    expect(normalizeWord("が")).toBe("か");
    expect(normalizeWord("ぱ")).toBe("は");
    expect(normalizeWord("ヴ")).toBe("う");
  });

  it("normalizes small kana to regular kana", () => {
    expect(normalizeWord("ゃゅょっ")).toBe("やゆよつ");
  });

  it("converts katakana to hiragana", () => {
    expect(normalizeWord("ジュース")).toBe("しゆーす");
  });
});

describe("validateNormalizedWord", () => {
  it("rejects too short, too long, and invalid characters", () => {
    expect(validateNormalizedWord("あ")).toMatch("2文字以上");
    expect(validateNormalizedWord("あいうえおかきく")).toMatch("7文字以内");
    expect(validateNormalizedWord("abc")).toMatch("使える文字");
  });
});

describe("createRevealResult", () => {
  it("reveals all matching repeated letters", () => {
    const privateWord = buildPrivateWord("きつつき");
    const attack: Attack = {
      id: "attack-1",
      attackerId: "p1",
      letter: "つ",
      attackNumber: 1,
    };

    const result = createRevealResult(
      attack,
      "p2",
      privateWord,
      [null, null, null, null, null, null, null],
    );

    expect(result.positions).toEqual([1, 2]);
    expect(result.eliminated).toBe(false);
  });

  it("marks eliminated when all non-x slots are revealed", () => {
    const privateWord = buildPrivateWord("かき");
    const attack: Attack = {
      id: "attack-1",
      attackerId: "p1",
      letter: "き",
      attackNumber: 1,
    };

    const result = createRevealResult(
      attack,
      "p2",
      privateWord,
      ["か", null, null, null, null, null, null],
    );

    expect(result.positions).toEqual([1]);
    expect(result.eliminated).toBe(true);
  });
});
