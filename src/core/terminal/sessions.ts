// 内蔵ターミナルのシェル（パネルのタブ・スマホのターミナル）。シェルはコアで動かし、つなぐ人（クライアント）は何人でもよい:
// この Mac の画面はメインプロセスの IPC から（main/terminal/terminals.ts）、スマホは WebSocket から（http/routes/terminals.ts）。
// 画面の内容は裏の端末（output.ts）にも書いておき、つなぎ直した・あとからつないだ人には、いまの画面の内容（snapshot）を渡す
import { statSync } from "node:fs";
import os from "node:os";
import * as pty from "node-pty";
import type { TerminalStart, TerminalTabMeta } from "@shared/ipc";
import type { TerminalShell } from "../platform/types.js";
import type { TerminalControl, TerminalTabInfo, TerminalTail } from "./control.js";
import { TerminalOutput } from "./output.js";

/** シェルにつないでいる人（出力と終わりを受け取る） */
export interface TerminalClient {
  id: string;
  data(data: string): void;
  exit(exitCode: number): void;
}

/** シェルの中身（テストでは偽物に差し替える） */
export interface TerminalProcess {
  readonly cols: number;
  readonly rows: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(fn: (data: string) => void): void;
  onExit(fn: (e: { exitCode: number }) => void): void;
}

export type SpawnTerminal = (file: string, args: string[], opts: { cols: number; rows: number; cwd: string; env: Record<string, string> }) => TerminalProcess;

const spawnPty: SpawnTerminal = (file, args, { cols, rows, cwd, env }) => {
  const proc = pty.spawn(file, args, { name: "xterm-256color", cols, rows, cwd, env });
  return {
    get cols() {
      return proc.cols;
    },
    get rows() {
      return proc.rows;
    },
    write: (data) => proc.write(data),
    resize: (c, r) => proc.resize(c, r),
    kill: () => proc.kill(),
    onData: (fn) => void proc.onData(fn),
    onExit: (fn) => void proc.onExit(fn),
  };
};

interface Session {
  proc: TerminalProcess;
  output: TerminalOutput;
  clients: Map<string, TerminalClient>;
  /** 持ち主（この Mac の画面なら、その画面が消えたら止める。スマホが作ったものは端末の印）。大きさを変えられるのは持ち主だけ */
  owner: string;
  cwd: string;
  command: string | null;
  meta: TerminalTabMeta | null;
}

/** つなぐ頼み */
export interface TerminalOpen {
  key: string;
  cwd: string;
  cols: number;
  rows: number;
  client: TerminalClient;
  /** 持ち主（シェルがなければ作った人が持ち主。あれば、渡したときだけ持ち主を替える = この Mac の画面がつなぎ直したとき） */
  owner?: string;
  start?: TerminalStart;
  meta?: TerminalTabMeta;
}

interface SessionsOptions {
  shell: TerminalShell;
  /** シェルに足す環境変数（どちらの Kickoff のターミナルかなど） */
  env?: Record<string, string>;
  /** 作業場所ごとに足す環境変数（ワークツリーの PORT） */
  envOf?: (cwd: string) => Record<string, string>;
  spawn?: SpawnTerminal;
}

/** 桁数・行数を、シェルが扱える範囲に丸める */
export const clampSize = (n: number) => Math.max(2, Math.min(1000, Math.floor(n)));

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** シェルに渡す環境変数（Electron の内部用の変数は渡さない） */
function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("ELECTRON_")) env[k] = v;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.TERM_PROGRAM = "Kickoff";
  // Finder から起動すると LANG がなく、日本語が崩れる
  env.LANG ??= "ja_JP.UTF-8";
  return env;
}

export class TerminalSessions implements TerminalControl {
  private readonly sessions = new Map<string, Session>();
  private readonly spawn: SpawnTerminal;

  constructor(private readonly opts: SessionsOptions) {
    this.spawn = opts.spawn ?? spawnPty;
  }

  /**
   * つなぐ: そのキーのシェルがあれば、いまの画面の内容を返す（つなぎ直す。start は使わず、流し直さない）。なければ cwd で新しく始める
   * （start のコマンドがあれば、それを流すタブとして）。返事が届くまでの出力は snapshot に入り、返事のあとの出力は client に届く
   */
  async open({ key, cwd, cols, rows, client, owner, start, meta }: TerminalOpen): Promise<{ snapshot: string; created: boolean }> {
    const existing = this.sessions.get(key);
    if (existing) {
      if (meta) existing.meta = meta;
      if (owner) existing.owner = owner;
      // ほかの人にまだ送っていない出力を先に送る（新しい人の分は snapshot に入る）
      existing.output.flush();
      const snapshot = await existing.output.snapshot();
      existing.clients.set(client.id, client);
      return { snapshot, created: false };
    }
    const found = isDirectory(cwd);
    const session = this.start(key, found ? cwd : os.homedir(), clampSize(cols), clampSize(rows), owner ?? client.id, start);
    session.meta = meta ?? null;
    // 作業場所のフォルダが見つからず（ワークツリーが消されたなど）ホームで開いたときは、画面の先頭でそう知らせる（裏の端末に書いて snapshot に入れる）
    if (cwd !== "" && !found) session.output.write(`\x1b[33m作業場所のフォルダが見つからないため、ホームフォルダで開きました（${cwd}）\x1b[0m\r\n`);
    const snapshot = await session.output.snapshot();
    session.clients.set(client.id, client);
    return { snapshot, created: true };
  }

  /** そのシェルがあるか */
  has(key: string): boolean {
    return this.sessions.has(key);
  }

  /** そのシェルの持ち主 */
  ownerOf(key: string): string | null {
    return this.sessions.get(key)?.owner ?? null;
  }

  write(key: string, data: string): void {
    this.sessions.get(key)?.proc.write(data);
  }

  resize(key: string, cols: number, rows: number): void {
    const session = this.sessions.get(key);
    if (!session) return;
    const c = clampSize(cols);
    const r = clampSize(rows);
    if (c === session.proc.cols && r === session.proc.rows) return;
    session.proc.resize(c, r);
    session.output.resize(c, r);
  }

  /** 離れる（シェルは止めない。スマホが閉じた・つなぎ直す） */
  detach(key: string, clientId: string): void {
    this.sessions.get(key)?.clients.delete(clientId);
  }

  /** シェルを止める（タブを閉じた） */
  close(key: string): void {
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    session.output.dispose();
    try {
      session.proc.kill();
    } catch {
      // すでに終わっている
    }
  }

  /** その持ち主のシェルをすべて止める（この Mac の画面を読み直した・閉じた。タブの記録は画面と一緒に消えるので、残すと止められなくなる） */
  closeOwnedBy(owner: string): void {
    for (const [key, session] of this.sessions) if (session.owner === owner) this.close(key);
  }

  /** その人を、つないでいるシェルすべてから外す */
  detachEverywhere(clientId: string): void {
    for (const session of this.sessions.values()) session.clients.delete(clientId);
  }

  /** コアを閉じるとき */
  closeAll(): void {
    for (const key of [...this.sessions.keys()]) this.close(key);
  }

  /** いま動いているシェルのタブ（AI のツール・スマホのターミナルの一覧） */
  list(): TerminalTabInfo[] {
    return [...this.sessions].map(([key, s]) => ({ key, project_id: s.meta?.projectId ?? null, title: s.meta?.title ?? "ターミナル", cwd: s.cwd, command: s.command }));
  }

  async tail(key: string, lines: number): Promise<TerminalTail | null> {
    const session = this.sessions.get(key);
    return session ? session.output.tail(lines) : null;
  }

  private start(key: string, cwd: string, cols: number, rows: number, owner: string, startWith: TerminalStart = {}): Session {
    // 決まったコマンドのタブは、そのコマンドだけを流す（シェルと引数は OS の口。macOS はログインシェル）
    const { shell } = this.opts;
    const env = { ...baseEnv(), ...this.opts.env, ...this.opts.envOf?.(cwd), ...startWith.env };
    const proc = this.spawn(shell.file, shell.args(startWith.command ?? null), { cols, rows, cwd, env });
    const clients = new Map<string, TerminalClient>();
    const output = new TerminalOutput(
      (data) => {
        for (const c of clients.values()) c.data(data);
      },
      { cols, rows },
    );
    const session: Session = { proc, output, clients, owner, cwd, command: startWith.command ?? null, meta: null };
    // 止めたあと（タブを閉じた・開き直した）に届いたものは捨てる
    const current = () => this.sessions.get(key) === session;
    proc.onData((data) => {
      if (current()) output.write(data);
    });
    // シェルが自分で終わったとき（exit など）。タブは残し、つないでいる人に知らせる
    proc.onExit(({ exitCode }) => {
      if (!current()) return;
      output.flush();
      this.sessions.delete(key);
      output.dispose();
      for (const c of clients.values()) c.exit(exitCode);
    });
    this.sessions.set(key, session);
    return session;
  }
}
