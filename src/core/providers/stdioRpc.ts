import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { errorMessage } from "@shared/errors";

/**
 * CLI と標準入出力の JSON-RPC で話す口（1 行に 1 つの JSON）。Codex の app-server（"jsonrpc" の欄なし）と ACP のエージェント（JSON-RPC 2.0）で共有する。
 * 起動は差し替えられる口（StdioSpawn）にして、テストでは台本どおりに答える偽物を使う（src/core/testing/fakeStdioServer.ts）
 */

/** 起動した CLI（標準入出力と終わり） */
export interface StdioProcess {
  write(line: string): void;
  onLine(listener: (line: string) => void): void;
  /** 終わったとき（code: 終了コード。標準エラーの終わりの部分を添える） */
  onExit(listener: (code: number | null, stderrTail: string) => void): void;
  kill(): void;
}

export type StdioSpawn = (args: string[], opts: { env: Record<string, string | undefined>; cwd: string }) => StdioProcess;

/** 標準エラーの覚える長さ（落ちたときの理由の文に添える分） */
const STDERR_TAIL = 2000;

/** 本物の起動（executable は CLI の実行ファイル） */
export function spawnStdio(executable: string): StdioSpawn {
  return (args, { env, cwd }) => {
    const child = spawn(executable, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL);
    });
    const lines = createInterface({ input: child.stdout });
    const exitListeners: ((code: number | null, tail: string) => void)[] = [];
    let exited = false;
    const exit = (code: number | null) => {
      if (exited) return;
      exited = true;
      for (const listener of exitListeners) listener(code, stderr);
    };
    child.on("exit", (code) => exit(code));
    child.on("error", (e) => {
      stderr += `\n${errorMessage(e)}`;
      exit(null);
    });
    return {
      write: (line) => {
        if (!child.stdin.destroyed) child.stdin.write(`${line}\n`);
      },
      onLine: (listener) => lines.on("line", listener),
      onExit: (listener) => exitListeners.push(listener),
      kill: () => {
        if (child.exitCode === null) child.kill("SIGTERM");
      },
    };
  };
}

/** CLI が JSON-RPC の失敗で答えた */
export class StdioRpcError extends Error {
  constructor(
    readonly method: string,
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

type Pending = { method: string; resolve: (value: unknown) => void; reject: (error: Error) => void };

/** サーバーからの頼みへの答え（投げたら JSON-RPC の失敗で答える） */
export type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown>;

export interface StdioRpcOpts {
  /** 失敗の文に出す相手の名前（「Codex の app-server」など） */
  label: string;
  /** 送る行に "jsonrpc": "2.0" を付けるか（ACP は付ける。Codex の app-server は付けない）。受ける行はどちらでも読む */
  jsonrpc?: boolean;
}

export class StdioRpc {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closedReason: string | null = null;
  private readonly envelope: Record<string, string>;

  constructor(
    private readonly proc: StdioProcess,
    private readonly onNotification: (method: string, params: unknown) => void,
    private readonly onServerRequest: ServerRequestHandler,
    /** 終わったとき（落ちた・止めた。理由の文） */
    private readonly onClosed: ((reason: string) => void) | undefined,
    private readonly opts: StdioRpcOpts,
  ) {
    this.envelope = opts.jsonrpc ? { jsonrpc: "2.0" } : {};
    proc.onLine((line) => this.receive(line));
    proc.onExit((code, tail) => this.fail(`${opts.label}が終わりました（終了コード ${code ?? "不明"}）${tail.trim() ? `: ${tail.trim().split("\n").slice(-3).join(" / ")}` : ""}`));
  }

  /** 終わっていたら、その理由（終わっていなければ null） */
  get closed(): string | null {
    return this.closedReason;
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (this.closedReason) return Promise.reject(new StdioRpcError(method, this.closedReason));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closedReason) return;
    this.write(params === undefined ? { method } : { method, params });
  }

  /** CLI を止める（待っている頼みは失敗にする） */
  close(): void {
    this.fail(`${this.opts.label}を止めました`);
    this.proc.kill();
  }

  private write(msg: Record<string, unknown>) {
    this.proc.write(JSON.stringify({ ...this.envelope, ...msg }));
  }

  private fail(reason: string) {
    if (this.closedReason) return;
    this.closedReason = reason;
    for (const [, pending] of this.pending) pending.reject(new StdioRpcError(pending.method, reason));
    this.pending.clear();
    this.onClosed?.(reason);
  }

  private receive(line: string) {
    let msg: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // JSON でない行（起動の案内など）は読み飛ばす
    }
    if (typeof msg !== "object" || msg === null) return;
    if (typeof msg.method === "string" && msg.id !== undefined && msg.id !== null) {
      void this.answer(msg.id, msg.method, msg.params);
      return;
    }
    if (typeof msg.method === "string") {
      this.onNotification(msg.method, msg.params);
      return;
    }
    if (typeof msg.id !== "number") return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new StdioRpcError(pending.method, msg.error.message ?? `${this.opts.label}が失敗を返しました`, msg.error.code));
    else pending.resolve(msg.result);
  }

  private async answer(id: number | string, method: string, params: unknown) {
    try {
      const result = await this.onServerRequest(method, params);
      if (!this.closedReason) this.write({ id, result: result ?? null });
    } catch (e) {
      if (!this.closedReason) this.write({ id, error: { code: -32000, message: errorMessage(e) } });
    }
  }
}
