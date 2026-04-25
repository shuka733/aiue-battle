import type { Attack, LogEntry, Player, PublicGameState, RevealResult } from "../types";
import { SLOT_COUNT } from "./rules";

const COLORS = ["#157a6e", "#d65a3d", "#5b5fc7", "#be8a00", "#0f766e"];

function entry(text: string, tone: LogEntry["tone"] = "info"): LogEntry {
  return {
    id: createId("log"),
    text,
    tone,
  };
}

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createPlayer(id: string, name: string, isHost = false, index = 0): Player {
  return {
    id,
    name: name.trim() || "名無し",
    color: COLORS[index % COLORS.length],
    isHost,
    ready: false,
    status: "connected",
    revealed: Array.from({ length: SLOT_COUNT }, () => null),
  };
}

export function createInitialState(roomId: string, host: Player): PublicGameState {
  return {
    roomId,
    phase: "lobby",
    topic: "",
    players: [host],
    attackedLetters: [],
    currentPlayerId: null,
    turnAttackCount: 0,
    activeAttack: null,
    winnerId: null,
    log: [entry("部屋を作成しました。", "system")],
  };
}

export function getActivePlayers(state: PublicGameState): Player[] {
  return state.players.filter((player) => player.status === "connected");
}

export function addPlayer(state: PublicGameState, playerId: string, name: string): PublicGameState {
  if (state.players.some((player) => player.id === playerId)) {
    return state;
  }

  const player = createPlayer(playerId, name, false, state.players.length);
  return {
    ...state,
    players: [...state.players, player],
    log: [entry(`${player.name} が参加しました。`, "system"), ...state.log],
  };
}

export function markPlayerDisconnected(state: PublicGameState, playerId: string): PublicGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId && player.status === "connected"
        ? { ...player, status: "disconnected" }
        : player,
    ),
    log: [entry("プレイヤーの接続が切れました。", "system"), ...state.log],
  };
}

export function startWordPhase(state: PublicGameState, topic: string): PublicGameState {
  return {
    ...state,
    phase: "word",
    topic: topic.trim(),
    attackedLetters: [],
    currentPlayerId: null,
    turnAttackCount: 0,
    activeAttack: null,
    winnerId: null,
    players: state.players.map((player) => ({
      ...player,
      ready: false,
      status: player.status === "eliminated" ? "connected" : player.status,
      revealed: Array.from({ length: SLOT_COUNT }, () => null),
    })),
    log: [entry(`お題は「${topic.trim()}」です。`, "system")],
  };
}

export function markWordSubmitted(state: PublicGameState, playerId: string): PublicGameState {
  const next = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, ready: true } : player,
    ),
    log: [
      entry(`${state.players.find((player) => player.id === playerId)?.name ?? "プレイヤー"} が準備完了しました。`, "system"),
      ...state.log,
    ],
  };

  const connected = getActivePlayers(next);
  const allReady = connected.length >= 2 && connected.every((player) => player.ready);

  if (!allReady) {
    return next;
  }

  return {
    ...next,
    phase: "playing",
    currentPlayerId: connected[0]?.id ?? null,
    turnAttackCount: 0,
    log: [entry("ゲーム開始です。", "system"), ...next.log],
  };
}

export function startAttack(state: PublicGameState, attack: Attack): PublicGameState {
  return {
    ...state,
    activeAttack: attack,
    attackedLetters: [...state.attackedLetters, attack.letter],
    turnAttackCount: attack.attackNumber === 1 ? 0 : 1,
    log: [
      entry(
        `${state.players.find((player) => player.id === attack.attackerId)?.name ?? "プレイヤー"} が「${attack.letter}」で攻撃しました。`,
        "info",
      ),
      ...state.log,
    ],
  };
}

export function advanceTurn(state: PublicGameState, fromPlayerId: string): string | null {
  const active = getActivePlayers(state);
  if (active.length === 0) {
    return null;
  }

  const fromIndex = state.players.findIndex((player) => player.id === fromPlayerId);
  for (let step = 1; step <= state.players.length; step += 1) {
    const candidate = state.players[(fromIndex + step) % state.players.length];
    if (candidate?.status === "connected") {
      return candidate.id;
    }
  }

  return active[0]?.id ?? null;
}

export function resolveAttack(state: PublicGameState, attack: Attack, results: RevealResult[]): PublicGameState {
  const hitCount = results.reduce((total, result) => total + result.positions.length, 0);
  const eliminatedIds = new Set(results.filter((result) => result.eliminated).map((result) => result.playerId));
  const players = state.players.map((player) => {
    const result = results.find((item) => item.playerId === player.id);
    const revealed = [...player.revealed];

    if (result) {
      result.positions.forEach((position) => {
        revealed[position] = result.letter;
      });
    }

    return {
      ...player,
      revealed,
      status:
        player.status === "connected" && eliminatedIds.has(player.id)
          ? "eliminated"
          : player.status,
    };
  });

  const afterResults: PublicGameState = {
    ...state,
    players,
    activeAttack: null,
  };

  const active = getActivePlayers(afterResults);
  const winner = active.length === 1 ? active[0] : null;
  const attackerStillActive = players.some(
    (player) => player.id === attack.attackerId && player.status === "connected",
  );
  const canAttackAgain = hitCount > 0 && attack.attackNumber === 1 && attackerStillActive && !winner;
  const nextPlayerId = canAttackAgain ? attack.attackerId : advanceTurn(afterResults, attack.attackerId);

  const resultLog = hitCount > 0
    ? entry(`${hitCount}枚の文字が公開されました。`, "hit")
    : entry("誰にも当たりませんでした。", "miss");
  const eliminatedLog = players
    .filter((player) => eliminatedIds.has(player.id))
    .map((player) => entry(`${player.name} が脱落しました。`, "system"));

  if (winner) {
    return {
      ...afterResults,
      phase: "finished",
      winnerId: winner.id,
      currentPlayerId: null,
      turnAttackCount: 0,
      log: [entry(`${winner.name} の勝利です。`, "system"), ...eliminatedLog, resultLog, ...state.log],
    };
  }

  return {
    ...afterResults,
    currentPlayerId: nextPlayerId,
    turnAttackCount: canAttackAgain ? 1 : 0,
    log: [
      ...(canAttackAgain ? [entry("攻撃成功。もう1回攻撃できます。", "hit")] : []),
      ...eliminatedLog,
      resultLog,
      ...state.log,
    ],
  };
}

export function eliminatePlayer(state: PublicGameState, playerId: string): PublicGameState {
  const players = state.players.map((player) =>
    player.id === playerId ? { ...player, status: "eliminated" as const } : player,
  );
  const afterElimination: PublicGameState = {
    ...state,
    players,
    activeAttack: null,
  };
  const active = getActivePlayers(afterElimination);
  const winner = active.length === 1 ? active[0] : null;

  if (winner) {
    return {
      ...afterElimination,
      phase: "finished",
      winnerId: winner.id,
      currentPlayerId: null,
      turnAttackCount: 0,
      log: [entry(`${winner.name} の勝利です。`, "system"), ...state.log],
    };
  }

  return {
    ...afterElimination,
    currentPlayerId:
      state.currentPlayerId === playerId ? advanceTurn(afterElimination, playerId) : state.currentPlayerId,
    log: [entry("切断中のプレイヤーを脱落扱いにしました。", "system"), ...state.log],
  };
}

export function resetToLobby(state: PublicGameState): PublicGameState {
  return {
    ...state,
    phase: "lobby",
    topic: "",
    attackedLetters: [],
    currentPlayerId: null,
    turnAttackCount: 0,
    activeAttack: null,
    winnerId: null,
    players: state.players
      .filter((player) => player.status !== "disconnected")
      .map((player) => ({
        ...player,
        ready: false,
        status: "connected",
        revealed: Array.from({ length: SLOT_COUNT }, () => null),
      })),
    log: [entry("ロビーに戻りました。", "system")],
  };
}
