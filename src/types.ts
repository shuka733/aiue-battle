export type GamePhase = "lobby" | "word" | "playing" | "finished";

export type PlayerStatus = "connected" | "disconnected" | "eliminated";

export type SlotValue = string | null;

export interface Player {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  status: PlayerStatus;
  revealed: SlotValue[];
}

export interface LogEntry {
  id: string;
  text: string;
  tone: "info" | "hit" | "miss" | "system";
}

export interface Attack {
  id: string;
  attackerId: string;
  letter: string;
  attackNumber: 1 | 2;
}

export interface RevealResult {
  attackId: string;
  playerId: string;
  letter: string;
  positions: number[];
  eliminated: boolean;
}

export interface PublicGameState {
  roomId: string;
  phase: GamePhase;
  topic: string;
  players: Player[];
  attackedLetters: string[];
  currentPlayerId: string | null;
  turnAttackCount: 0 | 1;
  activeAttack: Attack | null;
  winnerId: string | null;
  log: LogEntry[];
}

export interface PrivateWordState {
  raw: string;
  normalized: string;
  slots: string[];
}

export type NetworkMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "join:accepted"; playerId: string; state: PublicGameState }
  | { type: "join:rejected"; reason: string }
  | { type: "state:snapshot"; state: PublicGameState }
  | { type: "game:start"; topic: string }
  | { type: "word:submit"; playerId: string }
  | { type: "turn:attack"; attack: Attack }
  | { type: "turn:reveal-result"; result: RevealResult }
  | { type: "player:disconnect"; playerId: string }
  | { type: "host:eliminate-player"; playerId: string }
  | { type: "game:reset" };
