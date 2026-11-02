import { statSync } from "node:fs";
import os from "node:os";
import headless from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
import { app, ipcMain, type WebContents } from "electron";
import * as pty from "node-pty";

/**
 * 内蔵ターミナル（右のパネルのタブ）のシェル。画面とは IPC だけでつなぎ、Kickoff のサーバー（スマホから届く）は通さない。
 * 画面の部品はボードを切り替えるたびに作り直されるので、シェルはここで動かし続け、
 * 画面の内容は裏の端末（@xterm/headless）にも書いておき、つなぎ直したときにそのまま描けるようにする
 */

interface Session {
  pty: pty.IPty;
  screen: InstanceType<typeof headless.Terminal>;
  serializer: InstanceType<typeof serialize.SerializeAddon>;
  owner: WebContents;
  /** 画面へまだ送っていない出力（細かく届くので、まとめて送る） */
  pending: string;
  flushTimer?: ReturnType<typeof setTimeout>;
}

/** 出力をまとめて送るまでの時間 */
const FLUSH_MS = 8;
/** 裏の端末に残す行数（つなぎ直したときに遡れる分） */
const SCROLLBACK = 5000;

const sessions = new Map<string, Session>();

const clampSize = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(2, Math.min(1000, Math.floor(n))) : fallback);

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** シェルに渡す環境変数（Electron の内部用の変数は渡さない） */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("ELECTRON_")) env[k] = v;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.TERM_PROGRAM = "Kickoff";
  // どちらの Kickoff のターミナルか（製品版の中から製品版を入れ替えないよう、install-app が見る）
  env.KICKOFF_TERMINAL_OF = app.isPackaged ? "production" : "development";
  // Finder から起動すると LANG がなく、日本語が崩れる
  env.LANG ??= "ja_JP.UTF-8";
  return env;
}

function flush(key: string, session: Session) {
  session.flushTimer = undefined;
  if (!session.pending || session.owner.isDestroyed()) return;
  session.owner.send("kickoff:terminal-data", key, session.pending);
  session.pending = "";
}

function start(key: string, cwd: string, cols: number, rows: number, owner: WebContents): Session {
  const shell = process.env.SHELL || "/bin/zsh";
  const proc = pty.spawn(shell, ["-l"], { name: "xterm-256color", cols, rows, cwd, env: shellEnv() });
  const screen = new headless.Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true });
  const serializer = new serialize.SerializeAddon();
  screen.loadAddon(serializer);
  const session: Session = { pty: proc, screen, serializer, owner, pending: "" };
  // 止めたあと（タブを閉じた・開き直した）に届いたものは捨てる
  const current = () => sessions.get(key) === session;
  proc.onData((data) => {
    if (!current()) return;
    screen.write(data);
    session.pending += data;
    session.flushTimer ??= setTimeout(() => flush(key, session), FLUSH_MS);
  });
  // シェルが自分で終わったとき（exit など）。タブは残し、画面に知らせる
  proc.onExit(({ exitCode }) => {
    if (!current()) return;
    clearTimeout(session.flushTimer);
    flush(key, session);
    sessions.delete(key);
    screen.dispose();
    if (!session.owner.isDestroyed()) session.owner.send("kickoff:terminal-exit", key, exitCode);
  });
  sessions.set(key, session);
  return session;
}

function kill(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  clearTimeout(session.flushTimer);
  session.screen.dispose();
  try {
    session.pty.kill();
  } catch {
    // すでに終わっている
  }
}

/** 終了時の片付け: すべてのシェルを止める */
export function killAllTerminals() {
  for (const key of [...sessions.keys()]) kill(key);
}

/** 画面を読み直した・閉じたとき、その画面で開いていたシェルを止める（タブの記録は画面と一緒に消えるので、残すと止められなくなる） */
function killOwnedBy(owner: WebContents) {
  for (const [key, session] of sessions) if (session.owner === owner) kill(key);
}

const watched = new WeakSet<WebContents>();
function watchOwner(owner: WebContents) {
  if (watched.has(owner)) return;
  watched.add(owner);
  owner.on("destroyed", () => killOwnedBy(owner));
  owner.on("render-process-gone", () => killOwnedBy(owner));
  owner.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) killOwnedBy(owner);
  });
}

export function registerTerminalIpc() {
  /**
   * タブを表示したとき: そのキーのシェルがあれば、いまの画面の内容を返す（つなぎ直す）。なければ cwd で新しく始める。
   * created は新しく始めたか
   */
  ipcMain.handle("kickoff:terminal-open", (e, key: unknown, cwd: unknown, cols: unknown, rows: unknown) => {
    if (typeof key !== "string" || !key) throw new Error("ターミナルの指定が正しくありません");
    const existing = sessions.get(key);
    if (existing) {
      existing.owner = e.sender;
      flush(key, existing);
      return { snapshot: existing.serializer.serialize(), created: false };
    }
    const missing = typeof cwd === "string" && cwd !== "" && !isDirectory(cwd);
    const dir = typeof cwd === "string" && isDirectory(cwd) ? cwd : os.homedir();
    watchOwner(e.sender);
    const session = start(key, dir, clampSize(cols, 80), clampSize(rows, 24), e.sender);
    // 作業場所のフォルダが見つからず（ワークツリーが消されたなど）ホームで開いたときは、画面の先頭でそう知らせる
    if (missing) {
      const note = `\x1b[33m作業場所のフォルダが見つからないため、ホームフォルダで開きました（${cwd}）\x1b[0m\r\n`;
      session.screen.write(note);
      session.pending += note;
      flush(key, session);
    }
    return { snapshot: "", created: true };
  });
  ipcMain.on("kickoff:terminal-write", (_e, key: unknown, data: unknown) => {
    if (typeof key === "string" && typeof data === "string") sessions.get(key)?.pty.write(data);
  });
  ipcMain.on("kickoff:terminal-resize", (_e, key: unknown, cols: unknown, rows: unknown) => {
    const session = typeof key === "string" ? sessions.get(key) : undefined;
    if (!session) return;
    const c = clampSize(cols, session.pty.cols);
    const r = clampSize(rows, session.pty.rows);
    if (c === session.pty.cols && r === session.pty.rows) return;
    session.pty.resize(c, r);
    session.screen.resize(c, r);
  });
  // タブを閉じたとき
  ipcMain.handle("kickoff:terminal-close", (_e, key: unknown) => {
    if (typeof key === "string") kill(key);
  });
}
