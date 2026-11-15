import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { errorMessage } from "@shared/errors";

/**
 * Codex の app-server と話す JSON-RPC の口（標準入出力。1 行に 1 つの JSON。"jsonrpc" の欄は付けない）。
 * 起動は差し替えられる口（CodexSpawn）にして、テストでは台本どおりに答える偽物を使う（src/core/testing/fakeCodexServer.ts）
 */

/** 起動した app-server（標準入出力と終わり） */
export interface CodexProcess {
  write(line: string): void;
  onLine(listener: (line: string) => void): void;
  /** 終わったとき（code: 終了コード。標準エラーの終わりの部分を添える） */
  onExit(listener: (code: number | null, stderrTail: string) => void): void;
  kill(): void;
}

export type CodexSpawn = (args: string[], opts: { env: Record<string, string | undefined>; cwd: string }) => CodexProcess;

/** 標準エラーの覚える長さ（落ちたときの理由の文に添える分） */
const STDERR_TAIL = 2000;

/** 本物の起動（executable は codex の実行ファイル） */
export function spawnCodex(executable: string): CodexSpawn {
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

/** app-server が JSON-RPC の失敗で答えた */
export class CodexRpcError extends Error {
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

export class CodexRpc {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closedReason: string | null = null;

  constructor(
    private readonly proc: CodexProcess,
    private readonly onNotification: (method: string, params: unknown) => void,
    private readonly onServerRequest: ServerRequestHandler,
    /** 終わったとき（落ちた・止めた。理由の文） */
    private readonly onClosed?: (reason: string) => void,
  ) {
    proc.onLine((line) => this.receive(line));
    proc.onExit((code, tail) => this.fail(`Codex の app-server が終わりました（終了コード ${code ?? "不明"}）${tail.trim() ? `: ${tail.trim().split("\n").slice(-3).join(" / ")}` : ""}`));
  }

  /** 終わっていたら、その理由（終わっていなければ null） */
  get closed(): string | null {
    return this.closedReason;
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (this.closedReason) return Promise.reject(new CodexRpcError(method, this.closedReason));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject });
      this.proc.write(JSON.stringify({ id, method, params }));
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closedReason) return;
    this.proc.write(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  /** app-server を止める（待っている頼みは失敗にする） */
  close(): void {
    this.fail("Codex の app-server を止めました");
    this.proc.kill();
  }

  private fail(reason: string) {
    if (this.closedReason) return;
    this.closedReason = reason;
    for (const [, pending] of this.pending) pending.reject(new CodexRpcError(pending.method, reason));
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
    if (typeof msg.method === "string" && msg.id !== undefined) {
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
    if (msg.error) pending.reject(new CodexRpcError(pending.method, msg.error.message ?? "Codex が失敗を返しました", msg.error.code));
    else pending.resolve(msg.result);
  }

  private async answer(id: number | string, method: string, params: unknown) {
    try {
      const result = await this.onServerRequest(method, params);
      if (!this.closedReason) this.proc.write(JSON.stringify({ id, result }));
    } catch (e) {
      if (!this.closedReason) this.proc.write(JSON.stringify({ id, error: { code: -32000, message: errorMessage(e) } }));
    }
  }
}
