import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, Clipboard, LogIn, Play, RotateCcw, Swords, Users, Wifi } from "lucide-react";
import Peer, { type DataConnection } from "peerjs";
import type {
  Attack,
  NetworkMessage,
  Player,
  PrivateWordState,
  PublicGameState,
  RevealResult,
} from "./types";
import {
  addPlayer,
  createId,
  createInitialState,
  createPlayer,
  eliminatePlayer,
  getActivePlayers,
  markPlayerDisconnected,
  markWordSubmitted,
  resetToLobby,
  resolveAttack,
  startAttack,
  startWordPhase,
} from "./lib/game";
import {
  buildPrivateWord,
  createRevealResult,
  HIRAGANA_BOARD_ROWS,
  HIRAGANA_ATTACK_LETTERS,
  normalizeWord,
  SLOT_COUNT,
  validateNormalizedWord,
} from "./lib/rules";

type Role = "host" | "guest" | null;
type Screen = "home" | "room";

interface PendingAttack {
  attack: Attack;
  expected: Set<string>;
  results: RevealResult[];
}

const HOST_LIMIT = 5;

function sendMessage(conn: DataConnection | null | undefined, message: NetworkMessage) {
  if (conn?.open) {
    conn.send(message);
  }
}

function getRoomFromUrl() {
  return new URLSearchParams(window.location.search).get("room") ?? "";
}

function getPlayerName(players: Player[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [role, setRole] = useState<Role>(null);
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState(getRoomFromUrl());
  const [topicInput, setTopicInput] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [privateWord, setPrivateWord] = useState<PrivateWordState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [publicState, setPublicState] = useState<PublicGameState | null>(null);
  const [networkStatus, setNetworkStatus] = useState("未接続");
  const [notice, setNotice] = useState("");

  const peerRef = useRef<Peer | null>(null);
  const guestConnRef = useRef<DataConnection | null>(null);
  const hostConnectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const pendingAttacksRef = useRef<Map<string, PendingAttack>>(new Map());
  const publicStateRef = useRef<PublicGameState | null>(null);
  const privateWordRef = useRef<PrivateWordState | null>(null);
  const localPlayerIdRef = useRef<string | null>(null);
  const roleRef = useRef<Role>(null);

  useEffect(() => {
    publicStateRef.current = publicState;
  }, [publicState]);

  useEffect(() => {
    privateWordRef.current = privateWord;
  }, [privateWord]);

  useEffect(() => {
    localPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  const roomUrl = useMemo(() => {
    if (!publicState?.roomId) {
      return "";
    }
    const url = new URL(window.location.href);
    url.searchParams.set("room", publicState.roomId);
    return url.toString();
  }, [publicState?.roomId]);

  const localPlayer = useMemo(
    () => publicState?.players.find((player) => player.id === localPlayerId) ?? null,
    [localPlayerId, publicState?.players],
  );

  const wordPreview = useMemo(() => normalizeWord(wordInput), [wordInput]);
  const wordError = useMemo(() => {
    if (!wordInput.trim()) {
      return null;
    }
    return validateNormalizedWord(wordPreview);
  }, [wordInput, wordPreview]);

  const commitHostState = useCallback((next: PublicGameState) => {
    publicStateRef.current = next;
    setPublicState(next);
    hostConnectionsRef.current.forEach((conn) => {
      sendMessage(conn, { type: "state:snapshot", state: next });
    });
  }, []);

  const broadcast = useCallback((message: NetworkMessage) => {
    hostConnectionsRef.current.forEach((conn) => sendMessage(conn, message));
  }, []);

  const finishPendingIfReady = useCallback(
    (attackId: string) => {
      const pending = pendingAttacksRef.current.get(attackId);
      const state = publicStateRef.current;
      if (!pending || !state || pending.results.length < pending.expected.size) {
        return;
      }

      pendingAttacksRef.current.delete(attackId);
      const next = resolveAttack(state, pending.attack, pending.results);
      commitHostState(next);
    },
    [commitHostState],
  );

  const receiveRevealResult = useCallback(
    (result: RevealResult) => {
      const pending = pendingAttacksRef.current.get(result.attackId);
      if (!pending || !pending.expected.has(result.playerId)) {
        return;
      }
      if (pending.results.some((item) => item.playerId === result.playerId)) {
        return;
      }

      pending.results.push(result);
      finishPendingIfReady(result.attackId);
    },
    [finishPendingIfReady],
  );

  const resolveLocalAttack = useCallback(
    (attack: Attack) => {
      const playerId = localPlayerIdRef.current;
      const state = publicStateRef.current;
      const word = privateWordRef.current;

      if (!playerId || !state || !word) {
        return;
      }

      const ownBoard = state.players.find((player) => player.id === playerId);
      if (!ownBoard || ownBoard.status !== "connected") {
        return;
      }

      const result = createRevealResult(attack, playerId, word, ownBoard.revealed);
      if (roleRef.current === "host") {
        receiveRevealResult(result);
      } else {
        sendMessage(guestConnRef.current, { type: "turn:reveal-result", result });
      }
    },
    [receiveRevealResult],
  );

  const handleAttackRequest = useCallback(
    (attackerId: string, letter: string) => {
      const state = publicStateRef.current;
      if (!state || state.phase !== "playing" || state.activeAttack) {
        return;
      }
      if (state.currentPlayerId !== attackerId || state.attackedLetters.includes(letter)) {
        return;
      }
      if (!(HIRAGANA_ATTACK_LETTERS as readonly string[]).includes(letter)) {
        return;
      }

      const attackNumber = state.turnAttackCount === 1 ? 2 : 1;
      const attack: Attack = {
        id: createId("attack"),
        attackerId,
        letter,
        attackNumber,
      };
      const next = startAttack(state, attack);
      const expected = new Set(getActivePlayers(next).map((player) => player.id));
      pendingAttacksRef.current.set(attack.id, { attack, expected, results: [] });
      commitHostState(next);
      broadcast({ type: "turn:attack", attack });
      resolveLocalAttack(attack);
    },
    [broadcast, commitHostState, resolveLocalAttack],
  );

  const handleWordSubmitted = useCallback(
    (playerId: string) => {
      const state = publicStateRef.current;
      if (!state || state.phase !== "word") {
        return;
      }
      commitHostState(markWordSubmitted(state, playerId));
    },
    [commitHostState],
  );

  const setupHostConnection = useCallback(
    (conn: DataConnection) => {
      conn.on("data", (payload) => {
        const message = payload as NetworkMessage;

        if (message.type === "join") {
          const state = publicStateRef.current;
          if (!state) {
            return;
          }
          if (state.players.length >= HOST_LIMIT) {
            sendMessage(conn, { type: "join:rejected", reason: "満席です。" });
            conn.close();
            return;
          }
          if (state.phase !== "lobby") {
            sendMessage(conn, { type: "join:rejected", reason: "ゲーム開始後は参加できません。" });
            conn.close();
            return;
          }

          hostConnectionsRef.current.set(message.playerId, conn);
          const next = addPlayer(state, message.playerId, message.name);
          commitHostState(next);
          sendMessage(conn, { type: "join:accepted", playerId: message.playerId, state: next });
          setNotice(`${message.name} が参加しました。`);
          return;
        }

        if (message.type === "word:submit") {
          handleWordSubmitted(message.playerId);
          return;
        }

        if (message.type === "turn:attack") {
          handleAttackRequest(message.attack.attackerId, message.attack.letter);
          return;
        }

        if (message.type === "turn:reveal-result") {
          receiveRevealResult(message.result);
        }
      });

      conn.on("close", () => {
        const playerId = [...hostConnectionsRef.current.entries()].find(([, value]) => value === conn)?.[0];
        if (!playerId) {
          return;
        }
        hostConnectionsRef.current.delete(playerId);
        pendingAttacksRef.current.forEach((pending, attackId) => {
          pending.expected.delete(playerId);
          finishPendingIfReady(attackId);
        });
        const state = publicStateRef.current;
        if (state) {
          commitHostState(markPlayerDisconnected(state, playerId));
        }
      });
    },
    [
      commitHostState,
      finishPendingIfReady,
      handleAttackRequest,
      handleWordSubmitted,
      receiveRevealResult,
    ],
  );

  const setupGuestConnection = useCallback(
    (conn: DataConnection, playerId: string, playerName: string) => {
      guestConnRef.current = conn;

      conn.on("open", () => {
        sendMessage(conn, { type: "join", playerId, name: playerName });
        setNetworkStatus("接続中");
      });

      conn.on("data", (payload) => {
        const message = payload as NetworkMessage;

        if (message.type === "join:accepted") {
          setPublicState(message.state);
          publicStateRef.current = message.state;
          setNetworkStatus("接続済み");
          setScreen("room");
          return;
        }

        if (message.type === "join:rejected") {
          setNotice(message.reason);
          setNetworkStatus("参加できません");
          return;
        }

        if (message.type === "state:snapshot") {
          setPublicState(message.state);
          publicStateRef.current = message.state;
          return;
        }

        if (message.type === "turn:attack") {
          resolveLocalAttack(message.attack);
          return;
        }

        if (message.type === "player:disconnect") {
          setNotice("プレイヤーの接続が切れました。");
        }
      });

      conn.on("close", () => {
        setNetworkStatus("ホストから切断");
      });
    },
    [resolveLocalAttack],
  );

  const createRoom = useCallback(() => {
    const playerName = name.trim();
    if (!playerName) {
      setNotice("名前を入力してください。");
      return;
    }

    const peer = new Peer();
    peerRef.current = peer;
    setNetworkStatus("部屋を作成中");

    peer.on("open", (roomId) => {
      const hostPlayer = createPlayer(roomId, playerName, true, 0);
      const state = createInitialState(roomId, hostPlayer);
      setRole("host");
      setLocalPlayerId(roomId);
      setPublicState(state);
      publicStateRef.current = state;
      setScreen("room");
      setNetworkStatus("ホスト");
    });

    peer.on("connection", setupHostConnection);
    peer.on("error", (error) => {
      setNetworkStatus("接続エラー");
      setNotice(error.message);
    });
  }, [name, setupHostConnection]);

  const joinRoom = useCallback(() => {
    const playerName = name.trim();
    const targetRoom = roomInput.trim();
    if (!playerName || !targetRoom) {
      setNotice("名前と部屋コードを入力してください。");
      return;
    }

    const peer = new Peer();
    peerRef.current = peer;
    setNetworkStatus("参加準備中");

    peer.on("open", (playerId) => {
      setRole("guest");
      setLocalPlayerId(playerId);
      const conn = peer.connect(targetRoom, {
        reliable: true,
        metadata: { name: playerName, playerId },
      });
      setupGuestConnection(conn, playerId, playerName);
    });

    peer.on("error", (error) => {
      setNetworkStatus("接続エラー");
      setNotice(error.message);
    });
  }, [name, roomInput, setupGuestConnection]);

  const copyRoomUrl = useCallback(async () => {
    if (!roomUrl) {
      return;
    }
    await navigator.clipboard.writeText(roomUrl);
    setNotice("部屋URLをコピーしました。");
  }, [roomUrl]);

  const submitTopic = useCallback(() => {
    const state = publicStateRef.current;
    if (!state || roleRef.current !== "host") {
      return;
    }
    if (state.players.length < 2) {
      setNotice("2人以上で開始できます。");
      return;
    }
    if (!topicInput.trim()) {
      setNotice("お題を入力してください。");
      return;
    }

    const next = startWordPhase(state, topicInput);
    setPrivateWord(null);
    setWordInput("");
    commitHostState(next);
    broadcast({ type: "game:start", topic: topicInput.trim() });
  }, [broadcast, commitHostState, topicInput]);

  const submitWord = useCallback(() => {
    const playerId = localPlayerIdRef.current;
    if (!playerId) {
      return;
    }

    try {
      const built = buildPrivateWord(wordInput);
      setPrivateWord(built);
      privateWordRef.current = built;
      if (roleRef.current === "host") {
        handleWordSubmitted(playerId);
      } else {
        sendMessage(guestConnRef.current, { type: "word:submit", playerId });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "入力を確認してください。");
    }
  }, [handleWordSubmitted, wordInput]);

  const requestAttack = useCallback(
    (letter: string) => {
      const playerId = localPlayerIdRef.current;
      const state = publicStateRef.current;
      if (!playerId || !state) {
        return;
      }
      const attack: Attack = {
        id: createId("request"),
        attackerId: playerId,
        letter,
        attackNumber: state.turnAttackCount === 1 ? 2 : 1,
      };

      if (roleRef.current === "host") {
        handleAttackRequest(playerId, letter);
      } else {
        sendMessage(guestConnRef.current, { type: "turn:attack", attack });
      }
    },
    [handleAttackRequest],
  );

  const hostEliminatePlayer = useCallback(
    (playerId: string) => {
      const state = publicStateRef.current;
      if (!state || roleRef.current !== "host") {
        return;
      }
      commitHostState(eliminatePlayer(state, playerId));
    },
    [commitHostState],
  );

  const resetGame = useCallback(() => {
    const state = publicStateRef.current;
    if (!state || roleRef.current !== "host") {
      return;
    }
    setPrivateWord(null);
    setWordInput("");
    setTopicInput("");
    commitHostState(resetToLobby(state));
    broadcast({ type: "game:reset" });
  }, [broadcast, commitHostState]);

  const isCurrentTurn =
    publicState?.phase === "playing" &&
    publicState.currentPlayerId === localPlayerId &&
    localPlayer?.status === "connected" &&
    !publicState.activeAttack;

  return (
    <main className="app-shell">
      {screen === "home" || !publicState ? (
        <HomeScreen
          name={name}
          networkStatus={networkStatus}
          notice={notice}
          roomInput={roomInput}
          setName={setName}
          setRoomInput={setRoomInput}
          createRoom={createRoom}
          joinRoom={joinRoom}
        />
      ) : (
        <section className="room-layout">
          <header className="room-header">
            <div>
              <p className="eyebrow">あいうえバトル Online</p>
              <h1>{publicState.topic || "ロビー"}</h1>
            </div>
            <div className="header-actions">
              <span className="status-pill">
                <Wifi size={16} />
                {networkStatus}
              </span>
              {role === "host" && (
                <button className="icon-button" type="button" onClick={copyRoomUrl} aria-label="部屋URLをコピー">
                  <Clipboard size={18} />
                </button>
              )}
            </div>
          </header>

          {notice && <div className="notice">{notice}</div>}

          {role === "host" && publicState.phase === "lobby" && (
            <div className="share-band">
              <div>
                <span>部屋コード</span>
                <strong>{publicState.roomId}</strong>
              </div>
              <button type="button" onClick={copyRoomUrl}>
                <Clipboard size={18} />
                URLをコピー
              </button>
            </div>
          )}

          {publicState.phase === "lobby" && (
            <LobbyView
              isHost={role === "host"}
              players={publicState.players}
              topicInput={topicInput}
              setTopicInput={setTopicInput}
              submitTopic={submitTopic}
            />
          )}

          {publicState.phase === "word" && (
            <WordView
              localReady={Boolean(localPlayer?.ready)}
              privateWord={privateWord}
              topic={publicState.topic}
              wordError={wordError}
              wordInput={wordInput}
              wordPreview={wordPreview}
              setWordInput={setWordInput}
              submitWord={submitWord}
              players={publicState.players}
            />
          )}

          {(publicState.phase === "playing" || publicState.phase === "finished") && (
            <GameView
              isCurrentTurn={Boolean(isCurrentTurn)}
              localPlayerId={localPlayerId}
              privateWord={privateWord}
              publicState={publicState}
              requestAttack={requestAttack}
              hostCanModerate={role === "host"}
              hostEliminatePlayer={hostEliminatePlayer}
              resetGame={resetGame}
            />
          )}
        </section>
      )}
    </main>
  );
}

interface HomeScreenProps {
  name: string;
  networkStatus: string;
  notice: string;
  roomInput: string;
  setName: (value: string) => void;
  setRoomInput: (value: string) => void;
  createRoom: () => void;
  joinRoom: () => void;
}

function HomeScreen({
  name,
  networkStatus,
  notice,
  roomInput,
  setName,
  setRoomInput,
  createRoom,
  joinRoom,
}: HomeScreenProps) {
  return (
    <section className="home-grid">
      <div className="home-title">
        <p className="eyebrow">Browser Word Battle</p>
        <h1>あいうえバトル Online</h1>
        <p>公開ページから部屋を作って、別端末のブラウザとリアルタイム対戦できます。</p>
      </div>

      <div className="entry-panel">
        <label htmlFor="name">名前</label>
        <input
          id="name"
          autoComplete="name"
          maxLength={18}
          placeholder="プレイヤー名"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="entry-actions">
          <button type="button" onClick={createRoom}>
            <Users size={18} />
            部屋を作る
          </button>
        </div>

        <div className="join-row">
          <label htmlFor="room">部屋コード</label>
          <input
            id="room"
            placeholder="ホストのコード"
            value={roomInput}
            onChange={(event) => setRoomInput(event.target.value)}
          />
          <button type="button" onClick={joinRoom}>
            <LogIn size={18} />
            参加
          </button>
        </div>

        <div className="connection-line">
          <Wifi size={16} />
          {networkStatus}
        </div>
        {notice && <div className="notice compact">{notice}</div>}
      </div>
    </section>
  );
}

interface LobbyViewProps {
  isHost: boolean;
  players: Player[];
  topicInput: string;
  setTopicInput: (value: string) => void;
  submitTopic: () => void;
}

function LobbyView({ isHost, players, topicInput, setTopicInput, submitTopic }: LobbyViewProps) {
  return (
    <section className="lobby-layout">
      <PlayerList players={players} />
      <div className="control-panel">
        <h2>お題</h2>
        {isHost ? (
          <>
            <input
              maxLength={24}
              placeholder="例: 動物、飲みもの、文房具"
              value={topicInput}
              onChange={(event) => setTopicInput(event.target.value)}
            />
            <button type="button" onClick={submitTopic}>
              <Play size={18} />
              お題を決定
            </button>
          </>
        ) : (
          <p className="muted">ホストがお題を決めています。</p>
        )}
      </div>
    </section>
  );
}

interface WordViewProps {
  localReady: boolean;
  privateWord: PrivateWordState | null;
  topic: string;
  wordError: string | null;
  wordInput: string;
  wordPreview: string;
  players: Player[];
  setWordInput: (value: string) => void;
  submitWord: () => void;
}

function WordView({
  localReady,
  privateWord,
  topic,
  wordError,
  wordInput,
  wordPreview,
  players,
  setWordInput,
  submitWord,
}: WordViewProps) {
  const previewSlots = useMemo(() => {
    const slots = wordPreview ? Array.from(wordPreview) : [];
    while (slots.length < SLOT_COUNT) {
      slots.push("×");
    }
    return slots.slice(0, SLOT_COUNT);
  }, [wordPreview]);

  return (
    <section className="word-layout">
      <div className="control-panel">
        <p className="eyebrow">お題</p>
        <h2>{topic}</h2>
        <label htmlFor="secret-word">秘密の言葉</label>
        <input
          id="secret-word"
          autoCapitalize="off"
          autoComplete="off"
          inputMode="text"
          lang="ja"
          maxLength={14}
          placeholder="2〜7文字"
          spellCheck={false}
          type="text"
          value={wordInput}
          disabled={localReady}
          onChange={(event) => setWordInput(event.target.value)}
        />
        <div className="slot-preview" aria-label="正規化プレビュー">
          {previewSlots.map((slot, index) => (
            <span key={`${slot}-${index}`} className={slot === "×" ? "slot muted-slot" : "slot"}>
              {slot}
            </span>
          ))}
        </div>
        {wordError && <p className="error-text">{wordError}</p>}
        {localReady ? (
          <div className="ready-line">
            <Check size={18} />
            準備完了
          </div>
        ) : (
          <button type="button" disabled={Boolean(wordError) || !wordInput.trim()} onClick={submitWord}>
            <Check size={18} />
            この言葉で準備
          </button>
        )}
        {privateWord && <p className="muted">登録済み: {privateWord.normalized}</p>}
      </div>
      <PlayerList players={players} />
    </section>
  );
}

interface GameViewProps {
  hostCanModerate: boolean;
  isCurrentTurn: boolean;
  localPlayerId: string | null;
  privateWord: PrivateWordState | null;
  publicState: PublicGameState;
  requestAttack: (letter: string) => void;
  hostEliminatePlayer: (playerId: string) => void;
  resetGame: () => void;
}

function GameView({
  hostCanModerate,
  isCurrentTurn,
  localPlayerId,
  privateWord,
  publicState,
  requestAttack,
  hostEliminatePlayer,
  resetGame,
}: GameViewProps) {
  const winnerName = getPlayerName(publicState.players, publicState.winnerId);
  const currentName = getPlayerName(publicState.players, publicState.currentPlayerId);

  return (
    <section className="game-layout">
      <div className="board-panel">
        <div className="turn-line">
          {publicState.phase === "finished" ? (
            <>
              <strong>{winnerName}</strong>
              <span>勝利</span>
            </>
          ) : (
            <>
              <span>手番</span>
              <strong>{currentName}</strong>
              {publicState.turnAttackCount === 1 && <em>連続攻撃</em>}
            </>
          )}
        </div>

        <div className="kana-board">
          {HIRAGANA_BOARD_ROWS.map((row) => (
            <div className="kana-row" key={row.join("")}>
              {row.map((letter) => {
                const used = publicState.attackedLetters.includes(letter);
                return (
                  <button
                    key={letter}
                    className={used ? "kana used" : "kana"}
                    type="button"
                    disabled={!isCurrentTurn || used || publicState.phase === "finished"}
                    onClick={() => requestAttack(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {publicState.activeAttack && (
          <div className="resolving">
            <Swords size={18} />
            「{publicState.activeAttack.letter}」判定中
          </div>
        )}

        {publicState.phase === "finished" && hostCanModerate && (
          <button type="button" onClick={resetGame}>
            <RotateCcw size={18} />
            ロビーへ戻る
          </button>
        )}
      </div>

      <div className="players-grid">
        {publicState.players.map((player) => (
          <PlayerBoard
            key={player.id}
            canModerate={hostCanModerate}
            isLocal={player.id === localPlayerId}
            player={player}
            privateWord={player.id === localPlayerId ? privateWord : null}
            hostEliminatePlayer={hostEliminatePlayer}
          />
        ))}
      </div>

      <aside className="log-panel">
        <h2>ログ</h2>
        <div className="log-list">
          {publicState.log.map((item) => (
            <p key={item.id} className={`log-item ${item.tone}`}>
              {item.text}
            </p>
          ))}
        </div>
      </aside>
    </section>
  );
}

interface PlayerBoardProps {
  canModerate: boolean;
  isLocal: boolean;
  player: Player;
  privateWord: PrivateWordState | null;
  hostEliminatePlayer: (playerId: string) => void;
}

function PlayerBoard({
  canModerate,
  isLocal,
  player,
  privateWord,
  hostEliminatePlayer,
}: PlayerBoardProps) {
  return (
    <article
      className={`player-card ${player.status}`}
      style={{ "--player-color": player.color } as CSSProperties}
    >
      <div className="player-card-head">
        <strong>{player.name}</strong>
        <span>{player.status === "connected" ? (player.ready ? "準備済み" : "参加中") : player.status}</span>
      </div>
      <div className="slot-row">
        {player.revealed.map((slot, index) => (
          <span key={index} className={slot ? "slot revealed" : "slot hidden"}>
            {slot ?? ""}
          </span>
        ))}
      </div>
      {isLocal && privateWord && (
        <div className="own-word">
          {privateWord.slots.map((slot, index) => (
            <span key={`${slot}-${index}`} className={slot === "×" ? "secret muted-slot" : "secret"}>
              {slot}
            </span>
          ))}
        </div>
      )}
      {canModerate && player.status === "disconnected" && (
        <button className="small-button" type="button" onClick={() => hostEliminatePlayer(player.id)}>
          脱落扱い
        </button>
      )}
    </article>
  );
}

function PlayerList({ players }: { players: Player[] }) {
  return (
    <div className="players-list">
      <h2>プレイヤー {players.length}/5</h2>
      {players.map((player) => (
        <div
          className="player-row"
          key={player.id}
          style={{ "--player-color": player.color } as CSSProperties}
        >
          <span className="color-dot" />
          <strong>{player.name}</strong>
          <span>{player.isHost ? "ホスト" : player.ready ? "準備済み" : "参加中"}</span>
        </div>
      ))}
    </div>
  );
}
