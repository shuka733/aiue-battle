import { describe, expect, it } from "vitest";
import {
  addPlayer,
  createInitialState,
  createPlayer,
  markWordSubmitted,
  resolveAttack,
  startAttack,
} from "./game";
import type { Attack, RevealResult } from "../types";

function readyState() {
  const host = createPlayer("p1", "Host", true, 0);
  let state = createInitialState("room", host);
  state = addPlayer(state, "p2", "Guest");
  state = { ...state, phase: "word", topic: "動物" };
  state = markWordSubmitted(state, "p1");
  state = markWordSubmitted(state, "p2");
  return state;
}

describe("game flow", () => {
  it("allows one bonus attack after a hit", () => {
    const attack: Attack = {
      id: "a1",
      attackerId: "p1",
      letter: "か",
      attackNumber: 1,
    };
    const state = startAttack(readyState(), attack);
    const result: RevealResult = {
      attackId: "a1",
      playerId: "p2",
      letter: "か",
      positions: [0],
      eliminated: false,
    };

    const next = resolveAttack(state, attack, [result]);

    expect(next.currentPlayerId).toBe("p1");
    expect(next.turnAttackCount).toBe(1);
  });

  it("advances turn after a miss", () => {
    const attack: Attack = {
      id: "a1",
      attackerId: "p1",
      letter: "か",
      attackNumber: 1,
    };
    const state = startAttack(readyState(), attack);
    const result: RevealResult = {
      attackId: "a1",
      playerId: "p2",
      letter: "か",
      positions: [],
      eliminated: false,
    };

    const next = resolveAttack(state, attack, [result]);

    expect(next.currentPlayerId).toBe("p2");
    expect(next.turnAttackCount).toBe(0);
  });

  it("handles self-hit elimination and declares the remaining winner", () => {
    const attack: Attack = {
      id: "a1",
      attackerId: "p1",
      letter: "あ",
      attackNumber: 1,
    };
    const state = startAttack(readyState(), attack);
    const selfResult: RevealResult = {
      attackId: "a1",
      playerId: "p1",
      letter: "あ",
      positions: [0],
      eliminated: true,
    };
    const guestResult: RevealResult = {
      attackId: "a1",
      playerId: "p2",
      letter: "あ",
      positions: [],
      eliminated: false,
    };

    const next = resolveAttack(state, attack, [selfResult, guestResult]);

    expect(next.phase).toBe("finished");
    expect(next.winnerId).toBe("p2");
  });
});
