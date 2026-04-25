import { describe, expect, it } from "vitest";
import { generateRoomCode, isRoomCode, normalizeRoomCodeInput } from "./room";

describe("room code helpers", () => {
  it("generates six digit room codes", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateRoomCode()).toMatch(/^\d{6}$/);
    }
  });

  it("normalizes pasted room code input to six digits", () => {
    expect(normalizeRoomCodeInput("12 34-56abc78")).toBe("123456");
  });

  it("validates six digit codes", () => {
    expect(isRoomCode("000001")).toBe(true);
    expect(isRoomCode("12345")).toBe(false);
    expect(isRoomCode("1234567")).toBe(false);
    expect(isRoomCode("abcdef")).toBe(false);
  });
});
