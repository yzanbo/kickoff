import { useSyncExternalStore } from "react";
import type { CommandOutput } from "@shared/types";
import { subscribeServerEvent } from "@/api/events";

/*
 * 実行中のコマンドの出力（SSE の chat_command_output。保存しない）を、呼び出し ID・作業 ID ごとに覚える店。
 * 0.5 秒ごとに届くので、流れのツールのまとまりを全部描き直さないよう、読む部品はキーごとに購読する（届いたキーの部品だけが描き直る）
 */

/** 覚えておく数（古いものから捨てる。終わったコマンドの出力は、結果が記録で届くので要らない） */
const MAX_KEPT = 50;

const outputs = new Map<string, CommandOutput>();
const listeners = new Map<string, Set<() => void>>();
let subscribed = false;

const toolKey = (toolUseId: string) => `tool:${toolUseId}`;
const taskKey = (taskId: string) => `task:${taskId}`;

function put(output: CommandOutput) {
  for (const key of [toolKey(output.tool_use_id), taskKey(output.task_id)]) {
    outputs.delete(key);
    outputs.set(key, output);
    for (const l of listeners.get(key) ?? []) l();
  }
  while (outputs.size > MAX_KEPT * 2) outputs.delete(outputs.keys().next().value!);
}

function subscribe(key: string, listener: () => void): () => void {
  if (!subscribed) {
    subscribed = true;
    subscribeServerEvent((e) => e.type === "chat_command_output" && put(e.output));
  }
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

const noop = () => () => {};

function useOutput(key: string | undefined): string | null {
  return useSyncExternalStore(
    key ? (l) => subscribe(key, l) : noop,
    () => (key ? (outputs.get(key)?.text ?? null) : null),
  );
}

/** 実行中のコマンドの出力の最後の行（Bash の呼び出し ID。まだ届いていない・ないときは null） */
export const useCommandOutput = (toolUseId: string | undefined) => useOutput(toolUseId && toolKey(toolUseId));

/** 裏で動いているコマンドの出力の最後の行（Claude Code の作業 ID） */
export const useTaskOutput = (taskId: string | undefined) => useOutput(taskId && taskKey(taskId));
