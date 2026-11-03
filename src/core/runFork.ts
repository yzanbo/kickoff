import type { AgentProvider } from "./providers/types.js";
import type { Store } from "./store.js";
import type { ProviderId, Run } from "./types.js";

/**
 * チャットを、作業の終わり（result イベント）の時点から分岐する（「Fork chat from here」）。
 * その時点までの会話を新しいセッションに写し、新しいチャットにその時点までの記録を写す。元のチャットは変えない。
 * ファイルの変更は戻さない（作業場所は元のチャットと同じ）。分岐できない時点・プロバイダーなら投げる（ルートで 400）
 */
export async function forkRun(deps: { store: Store; providers: Record<ProviderId, AgentProvider> }, run: Run, eventId: number, cwd: string): Promise<Run> {
  const { store, providers } = deps;
  const event = store.listEvents(run.id).find((e) => e.id === eventId);
  const point = event?.type === "result" ? (event.data as { status?: string; session_id?: string; message_id?: string }) : undefined;
  // 止めた・失敗した作業の終わり（以前の記録には message_id が付いている）からは分岐できない
  if (point?.status !== "completed" || !point.session_id || !point.message_id) throw new Error("この時点からは分岐できません");
  const provider = providers[run.provider];
  if (!provider.fork) throw new Error(`${provider.label} は分岐に対応していません`);
  const sessionId = await provider.fork(point.session_id, point.message_id, cwd);

  const forked = store.createRun({
    project_id: run.project_id,
    provider: run.provider,
    title: `${run.title}（分岐）`,
    status: "completed",
    model: run.model,
    effort: run.effort,
    permission_mode: run.permission_mode,
    fast_mode: run.fast_mode,
    group_id: run.group_id,
    worktree_path: run.worktree_path,
  });
  store.copyEvents(run.id, forked.id, eventId);
  store.addEvent(forked.id, { type: "notice", message: `「${run.title}」のこの時点から分岐しました（ファイルの変更は戻していません）` });
  return store.updateRun(forked.id, { session_id: sessionId, branch: run.branch, context_window: run.context_window });
}
