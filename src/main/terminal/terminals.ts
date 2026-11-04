import { statSync } from "node:fs";
import os from "node:os";
import { app, type WebContents } from "electron";
import * as pty from "node-pty";
import { sendEvent, type IpcHandlers } from "../ipc/register.js";
import { TerminalOutput } from "./output.js";

/**
 * 内蔵ターミナル（右のパネルのタブ）のシェル。画面とは IPC だけでつなぎ、Kickoff のサーバー（スマホから届く）は通さない。
 * 画面の部品はボードを切り替えるたびに作り直されるので、シェルはここで動かし続け、
 * 画面の内容は裏の端末（@xterm/headless）にも書いておき、つなぎ直したときにそのまま描けるようにする
 */

interface Session {
  pty: pty.IPty;
  /** 裏の端末と、画面へまとめて送る出力（output.ts） */
  output: TerminalOutput;
  owner: WebContents;
}

const sessions = new Map<string, Session>();

/** 桁数・行数を、シェルが扱える範囲に丸める */
const clampSize = (n: number) => Math.max(2, Math.min(1000, Math.floor(n)));

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

function start(key: string, cwd: string, cols: number, rows: number, owner: WebContents): Session {
  const shell = process.env.SHELL || "/bin/zsh";
  const proc = pty.spawn(shell, ["-l"], { name: "xterm-256color", cols, rows, cwd, env: shellEnv() });
  // 出力は、いまつないでいる画面へ送る（つなぎ直すと owner が変わる）
  const output = new TerminalOutput((data) => sendEvent(session.owner, "terminal", "onData", key, data), { cols, rows });
  const session: Session = { pty: proc, output, owner };
  // 止めたあと（タブを閉じた・開き直した）に届いたものは捨てる
  const current = () => sessions.get(key) === session;
  proc.onData((data) => {
    if (current()) output.write(data);
  });
  // シェルが自分で終わったとき（exit など）。タブは残し、画面に知らせる
  proc.onExit(({ exitCode }) => {
    if (!current()) return;
    output.flush();
    sessions.delete(key);
    output.dispose();
    sendEvent(session.owner, "terminal", "onExit", key, exitCode);
  });
  sessions.set(key, session);
  return session;
}

function kill(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  session.output.dispose();
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

/** 内蔵ターミナル（IPC の terminal）。引数の形は登録の補助（ipc/register.ts）が確かめてから渡す */
export const terminalHandlers: IpcHandlers["terminal"] = {
  /**
   * タブを表示したとき: そのキーのシェルがあれば、いまの画面の内容を返す（つなぎ直す）。なければ cwd で新しく始める。
   * 画面は返事が届くまでの出力を捨てるので、まだ送っていない出力は snapshot に入れて返す
   */
  open: async (e, key, cwd, cols, rows) => {
    const existing = sessions.get(key);
    if (existing) {
      // 別の画面（読み直したあとなど）からつなぎ直したときも、その画面が消えたらシェルを止められるように見張る
      existing.owner = e.sender;
      watchOwner(e.sender);
      return { snapshot: await existing.output.snapshot(), created: false };
    }
    const found = isDirectory(cwd);
    watchOwner(e.sender);
    const session = start(key, found ? cwd : os.homedir(), clampSize(cols), clampSize(rows), e.sender);
    // 作業場所のフォルダが見つからず（ワークツリーが消されたなど）ホームで開いたときは、画面の先頭でそう知らせる。
    // 知らせとして送ると画面が捨てるので、裏の端末に書いて snapshot に入れる（つなぎ直したときにも出る）
    if (cwd !== "" && !found) session.output.write(`\x1b[33m作業場所のフォルダが見つからないため、ホームフォルダで開きました（${cwd}）\x1b[0m\r\n`);
    return { snapshot: await session.output.snapshot(), created: true };
  },
  write: (_e, key, data) => {
    sessions.get(key)?.pty.write(data);
  },
  resize: (_e, key, cols, rows) => {
    const session = sessions.get(key);
    if (!session) return;
    const c = clampSize(cols);
    const r = clampSize(rows);
    if (c === session.pty.cols && r === session.pty.rows) return;
    session.pty.resize(c, r);
    session.output.resize(c, r);
  },
  // タブを閉じたとき
  close: (_e, key) => kill(key),
};
