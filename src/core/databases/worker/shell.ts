// 準備のコマンドの流し方（DB ワーカーの中）: 利用者のログインシェルで流す（AWS のプロファイルなど、ターミナルと同じ設定が要るため）。
// 止めるときは子孫のプロセスごと止める（aws ssm のように、コマンドが別のプログラムを起動するため）。
// シェルの起動の仕方とプロセスの親子は OS の口（ShellPlatform）から。ワーカーは口を受け取れないので、入口が setShellPlatform で渡す
import type { ChildProcess } from "node:child_process";
import type { ShellPlatform } from "../../platform/types.js";
import { spawnTracked } from "./children.js";

/** 出力を手元に持つ上限（終わりのほうを残す） */
const OUTPUT_MAX = 20_000;

let shellPlatform: ShellPlatform | null = null;

/** この OS のシェルの口を決める（ワーカーの入口 worker/main.ts と、同じプロセスで動かす inProcessWorker.ts が呼ぶ） */
export function setShellPlatform(platform: ShellPlatform) {
  shellPlatform = platform;
}

function platformOf(): ShellPlatform {
  if (!shellPlatform) throw new Error("DB ワーカーのシェルの口が決まっていません（setShellPlatform を呼んでください）");
  return shellPlatform;
}

/** ログインシェルでコマンドを起動する（標準入力は渡さない。待たない） */
export const spawnShell = (command: string): ChildProcess => {
  const { file, args } = platformOf().loginShell(command);
  return spawnTracked(file, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
};

/** プロセスと、その子孫すべてに SIGTERM を送る（子から先に） */
export function killTree(pid: number | undefined) {
  if (!pid) return;
  const children = platformOf().childrenByParent();
  const all: number[] = [];
  const walk = (p: number) => {
    all.push(p);
    for (const c of children.get(p) ?? []) walk(c);
  };
  walk(pid);
  for (const p of all.reverse()) {
    try {
      process.kill(p, "SIGTERM");
    } catch {
      // もう終わっている
    }
  }
}

export interface ShellResult {
  ok: boolean;
  /** 標準出力（パスワードを取るコマンドはこれを使う） */
  stdout: string;
  /** 標準出力と標準エラーを混ぜたもの（画面に出す。終わりのほうだけ） */
  output: string;
}

export interface ShellRun {
  done: Promise<ShellResult>;
  /** 止める（子孫ごと） */
  kill(): void;
}

/** コマンドを流して終わるのを待つ（timeoutMs を過ぎたら止めて失敗にする。onOutput で途中の出力を知らせる） */
export function runShell(command: string, { timeoutMs, onOutput }: { timeoutMs: number; onOutput?: (text: string) => void }): ShellRun {
  const proc = spawnShell(command);
  let stdout = "";
  let output = "";
  const add = (text: string) => {
    output = (output + text).slice(-OUTPUT_MAX);
    onOutput?.(text);
  };
  proc.stdout?.on("data", (d: Buffer) => {
    stdout = (stdout + d.toString()).slice(-OUTPUT_MAX);
    add(d.toString());
  });
  proc.stderr?.on("data", (d: Buffer) => add(d.toString()));
  let killed: string | null = null;
  const timer = setTimeout(() => {
    killed = `\n（${Math.round(timeoutMs / 60_000) || 1} 分たっても終わらないので止めました）`;
    killTree(proc.pid);
  }, timeoutMs);
  const done = new Promise<ShellResult>((resolve) => {
    proc.once("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, output: `${output}${e.message}` });
    });
    proc.once("close", (code) => {
      clearTimeout(timer);
      if (killed) add(killed);
      resolve({ ok: code === 0 && !killed, stdout, output });
    });
  });
  return {
    done,
    kill: () => {
      killed ??= "\n（止めました）";
      killTree(proc.pid);
    },
  };
}

/** いまの IP（{my_ip}）を問い合わせる（使うときだけ。答えが IP の形でなければ失敗） */
export async function fetchMyIp(url: string): Promise<string> {
  let text: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = (await res.text()).trim();
  } catch (e) {
    throw new Error(`いまの IP を ${url} に問い合わせられませんでした（${e instanceof Error ? e.message : String(e)}）`);
  }
  if (!/^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i.test(text)) throw new Error(`${url} の答えが IP の形ではありません`);
  return text;
}
