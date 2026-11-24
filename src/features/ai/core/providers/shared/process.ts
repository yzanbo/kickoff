// AI の CLI のプロセスまわりの共通の小物（名乗り・pid の知らせ・版・起動の環境変数）
import { reportChildProcess } from "@/foundation/core/system/childProcesses";
import { runCommand } from "@/foundation/core/system/exec";

/** Kickoff の名乗り（CLI・SDK の初期化に渡す。版は package.json の version と同じ） */
export const CLIENT_INFO = { name: "kickoff", title: "Kickoff", version: "0.1.0" } as const;

/**
 * 起動した AI の CLI の pid を、コアのプロセスの持ち主（メインプロセス）に知らせる（system/childProcesses.ts。コアが落ちたら、メインが作り直す前に止める）。
 * onSpawned は実行の指定の onAgentSpawned（診断が使う）。返り値は終わりを知らせる関数（何度呼んでも 1 回だけ知らせる）
 */
export function noteAgentProcess(pid: number, onSpawned?: (pid: number) => void): () => void {
  reportChildProcess({ pid, group: false, kind: "agent", state: "started" });
  onSpawned?.(pid);
  let exited = false;
  return () => {
    if (exited) return;
    exited = true;
    reportChildProcess({ pid, group: false, kind: "agent", state: "exited" });
  };
}

/** `<executable> --version` の 1 行目（60 文字まで）。見つからない・失敗なら null */
export async function cliVersion(executable: string): Promise<string | null> {
  try {
    const stdout = await runCommand(executable, ["--version"], { timeout: 5000 });
    return stdout.trim().split("\n")[0]?.slice(0, 60) ?? "";
  } catch {
    return null;
  }
}

/** 起動の環境変数: 元（process.env）に extra を重ね、drop の変数を外してから set を入れる（鍵の変数をサブスクで外す・API キーを入れる） */
export function launchEnv(
  base: Record<string, string | undefined>,
  extra: Record<string, string> | undefined,
  { drop = [], set = {} }: { drop?: readonly string[]; set?: Record<string, string> } = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base, ...(extra ?? {}) };
  for (const name of drop) delete env[name];
  return Object.assign(env, set);
}
