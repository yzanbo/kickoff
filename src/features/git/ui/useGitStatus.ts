import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { GitConflictResolution, GitOperationAction, GitStatus } from "@shared/git/types";
import { onServerEvent } from "@/foundation/ui/api/events";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { workplaceKey } from "@/foundation/ui/workplace/workplace";
import { gitAutoFetch, runGitOperation } from "./gitAutoFetch";
import { createGitStatusStore } from "./gitStatusStore";
import { gitApi } from "./api";
import { workdirInput } from "@/foundation/ui/api/workdir";

/** 画面全体で 1 つの Git の状態の店（作業場所ごとに 1 つの購読。取り直す決まりは gitStatusStore.ts） */
const gitStatuses = createGitStatusStore({ load: (ref) => gitApi("GET /api/projects/:projectId/git/status", workdirInput(ref)), fetch: (ref) => gitApi("POST /api/projects/:projectId/git/fetch", workdirInput(ref)), autoFetcher: gitAutoFetch });

// チャットが動いた（送った・終わった）か、作業中にツールの結果が届いた（ファイルを変えたかもしれない）。
// 作業中はチャットの行が変わらないので、ツールの結果も見ないと、差分が作業の終わりまで追いつかない
onServerEvent(["chat", "chat_event"], (e) => {
  if (e.type === "chat") gitStatuses.chatMoved(e.chat.project_id);
  else if (e.type === "chat_event" && e.event.type === "tool_result") gitStatuses.chatMoved(e.project_id);
});
if (typeof window !== "undefined") window.addEventListener("focus", () => gitStatuses.windowFocused());

/**
 * 作業場所の Git の状態（読む所が何か所あっても、同じ作業場所なら取りに行くのは 1 回）。active（変更・履歴のタブを開いている）の間は、
 * 一定の間隔でも取り直し、リモートの情報も裏で取ってくる（間を空ける・押した操作とぶつけないのは gitAutoFetch）。count はタブのバッジに出す変更のあるファイルの数。
 * worktree は作業場所（ワークツリーのフォルダ。null なら本体、省けば WorkplaceProvider の作業場所）
 */
export function useGitStatus(projectId: number, active: boolean, worktree?: string | null) {
  const ref = useWorkplace(projectId, worktree);
  const path = ref.worktree;
  const key = workplaceKey(ref);
  const subscribe = useCallback((listener: () => void) => gitStatuses.subscribe(key, listener), [key]);
  const state = useSyncExternalStore(subscribe, () => gitStatuses.state(key));
  const { refreshing, autoFetching, fetchError } = useSyncExternalStore(subscribe, () => gitStatuses.flags(key));
  useEffect(() => gitStatuses.watch({ projectId, worktree: path }), [projectId, path]);
  useEffect(() => (active ? gitStatuses.activate({ projectId, worktree: path }) : undefined), [projectId, path, active]);

  const apply = (request: Promise<GitStatus>) => gitStatuses.apply(ref, request);
  /** ステージ・ステージの取り消し・元に戻す */
  const act = (action: "stage" | "unstage" | "discard", paths: string[]) => apply(gitApi(`POST /api/projects/:projectId/git/${action}`, { ...workdirInput(ref), body: { paths } }));
  /** コミット（amend は直前のコミットに足して書き直す「コミット (修正)」） */
  const commit = (message: string, amend = false) => apply(gitApi("POST /api/projects/:projectId/git/commit", { ...workdirInput(ref), body: { message, amend } }));
  // リモートとやり取りする操作は、自動のフェッチの途中なら終わるのを待ってから（runGitOperation）
  const push = () => apply(runGitOperation(projectId, () => gitApi("POST /api/projects/:projectId/git/push", workdirInput(ref))));
  const pull = () => apply(runGitOperation(projectId, () => gitApi("POST /api/projects/:projectId/git/pull", workdirInput(ref))));
  /** リモートの情報を取ってきてから取り直す（遅れている数を出すため。取り直しのボタンで使う） */
  const fetchRemote = () => apply(runGitOperation(projectId, () => gitApi("POST /api/projects/:projectId/git/fetch", workdirInput(ref)))).catch((e: unknown) => gitStatuses.fetchFailed(ref, e));

  const value = state.data?.value;
  const count = value?.repo ? value.staged.length + value.unstaged.length + value.conflicts.length : 0;
  /** ほかの操作（ブランチの操作・途中のマージ）の応答で届いた状態を、取り直しを待たずに出す */
  const applyStatus = (next: GitStatus) => apply(Promise.resolve(next));
  /** 途中で止まっているマージ・リベースを、取りやめる・続ける・飛ばす（続けた先でまた衝突したら、衝突したファイルを返す） */
  const operate = async (action: GitOperationAction): Promise<string[]> => {
    const result = await gitApi("POST /api/projects/:projectId/git/operation", { ...workdirInput(ref), body: { action } });
    await applyStatus(result.status);
    return result.conflicts;
  };
  /** 衝突したファイルを解く（こちらの版・取り込む側の版・いまの中身で解決済み） */
  const resolve = (path: string, how: GitConflictResolution) => apply(gitApi("POST /api/projects/:projectId/git/resolve", { ...workdirInput(ref), body: { path, how } }));
  return {
    status: value,
    error: fetchError ?? state.error,
    loading: state.loading,
    refreshing,
    autoFetching,
    version: state.data?.version ?? 0,
    refresh: () => gitStatuses.refresh(ref),
    autoFetch: () => gitStatuses.autoFetch(ref),
    act,
    commit,
    push,
    pull,
    fetchRemote,
    applyStatus,
    operate,
    resolve,
    count,
  };
}

export type GitStatusController = ReturnType<typeof useGitStatus>;
