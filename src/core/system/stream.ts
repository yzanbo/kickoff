// 流れ続けるコマンド（docker events・中止できる docker compose up -d など）を動かす補助。
// runCommand（exec.ts）は終わるまで出力をためるので、つないだまま 1 行ずつ受け取るものと、途中で止めたいものはこちらを使う
import { spawn } from "node:child_process";
import { errorMessage } from "@shared/errors";

export interface StreamOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** 標準出力の 1 行ごと（改行は除く） */
  onLine?: (line: string) => void;
  /** 標準エラーの 1 行ごと（改行は除く） */
  onErrorLine?: (line: string) => void;
  /** 終わったときに返す標準エラーの最後の行数（既定 20） */
  tailLines?: number;
}

export interface StreamResult {
  /** 終了コード（シグナルで止まった・起動できなかったときは null） */
  code: number | null;
  /** 標準エラーの最後の数行（起動できなかったときは、その理由） */
  stderrTail: string;
  /** stop() で止めたか */
  stopped: boolean;
}

export interface StreamedCommand {
  /** 終わったら（止めたときも）解決する。失敗でも reject しない */
  done: Promise<StreamResult>;
  /** 止める（SIGTERM。3 秒で終わらなければ SIGKILL） */
  stop(): void;
}

/** 止めてから SIGKILL を送るまでの時間 */
const KILL_AFTER_MS = 3000;

/** 動いているもの（コアを閉じるときにまとめて止める） */
const running = new Set<StreamedCommand>();

/** 届いた塊を行に分ける（行の途中で切れた残りは次の塊とつなぐ）。改行の前の \r も落とす */
export function lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void } {
  let rest = "";
  const emit = (line: string) => onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
  return {
    push(chunk) {
      const parts = (rest + chunk).split("\n");
      rest = parts.pop() ?? "";
      for (const p of parts) emit(p);
    },
    end() {
      if (rest) emit(rest);
      rest = "";
    },
  };
}

/** コマンドを動かし、出力を 1 行ずつ渡す。コアを閉じるときは stopAllStreams でまとめて止める */
export function streamCommand(file: string, args: string[], { cwd, env, onLine, onErrorLine, tailLines = 20 }: StreamOptions = {}): StreamedCommand {
  const tail: string[] = [];
  let stopped = false;
  let killTimer: NodeJS.Timeout | undefined;
  const child = spawn(file, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const out = lineSplitter((line) => onLine?.(line));
  const err = lineSplitter((line) => {
    tail.push(line);
    if (tail.length > tailLines) tail.shift();
    onErrorLine?.(line);
  });
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => out.push(chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => err.push(chunk));

  const handle: StreamedCommand = {
    done: new Promise<StreamResult>((resolve) => {
      let settled = false;
      const finish = (code: number | null, reason?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        out.end();
        err.end();
        running.delete(handle);
        resolve({ code, stderrTail: reason ?? tail.join("\n").trim(), stopped });
      };
      child.on("error", (e) => finish(null, errorMessage(e)));
      child.on("close", (code) => finish(code));
    }),
    stop() {
      if (stopped || child.exitCode !== null || child.signalCode !== null) return;
      stopped = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_AFTER_MS);
      killTimer.unref();
    },
  };
  running.add(handle);
  return handle;
}

/** 動いているものをすべて止める（コアを閉じるとき。終わるのは待たない） */
export function stopAllStreams(): void {
  for (const h of [...running]) h.stop();
}
