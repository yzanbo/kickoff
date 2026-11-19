import type { StdioRpc } from "../stdioRpc.js";
import { findKickoffHook, hookTrustConfig, type ListedHook } from "./hooks.js";
import type { JsonValue, ThreadOverrides, ThreadResponse } from "./protocol.js";

/**
 * Kickoff の PreToolUse フック（hooks.ts）を、利用者の config.toml を書き換えずに「信頼済み」にする。
 * Codex は信頼していないフックを動かさない。信頼の覚え（hooks.state."<鍵>".trusted_hash）もスレッドの上書きで渡せるので、
 * フックの鍵と中身の指紋を、一時のスレッド（ephemeral。保存しない）で hooks/list に聞いてから、本物のスレッドに覚えごと渡す。
 * 本物のスレッドでフックが信頼済み・有効になったかは assertHookActive で確かめ、なっていなければ守りのないまま動かさない
 */

/** フックを有効にできなかったときの文 */
export const HOOK_INACTIVE = "Codex に Kickoff の守り（PreToolUse のフック）を有効にできなかったので、守りなしでは動かしません。codex-cli を最新にしてもう一度試してください";

type HooksListResponse = { data: Array<{ hooks: ListedHook[] }> };

/** フックを信頼した覚え（スレッドの上書きの config に足す） */
export async function kickoffHookTrust(rpc: StdioRpc, overrides: ThreadOverrides): Promise<Record<string, JsonValue>> {
  const probe = await rpc.request<ThreadResponse>("thread/start", { ...overrides, ephemeral: true });
  const hook = findKickoffHook(await rpc.request<HooksListResponse>("hooks/list", { threadId: probe.thread.id }));
  if (!hook) throw new Error(HOOK_INACTIVE);
  return hookTrustConfig(hook.key, hook.currentHash);
}

/** 本物のスレッドで、Kickoff のフックが信頼済みで有効か確かめる（でなければ投げる） */
export async function assertHookActive(rpc: StdioRpc, threadId: string): Promise<void> {
  const hook = findKickoffHook(await rpc.request<HooksListResponse>("hooks/list", { threadId }));
  if (!hook || !hook.enabled || hook.trustStatus !== "trusted") throw new Error(HOOK_INACTIVE);
}

/** スレッドの上書きに信頼の覚えを足す */
export const withHookTrust = (overrides: ThreadOverrides, trust: Record<string, JsonValue>): ThreadOverrides => ({ ...overrides, config: { ...(overrides.config ?? {}), ...trust } });
