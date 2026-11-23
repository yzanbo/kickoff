import fs from "node:fs";
import path from "node:path";
import type { BusEvent } from "@shared/foundation/contract";
import type { GitWorktree } from "@shared/git/types";
import { git } from "@/foundation/core/workplace/git";

/** 続けて変わったら（git の書き換えは HEAD.lock を作ってから名前を変える）まとめて 1 回知らせる */
const SETTLE_MS = 150;
/** 作りかけのワークツリー（`git worktree add` の途中）が一覧にあれば、この間をおいて取り直させる */
const UNSETTLED_RETRY_MS = 1000;
/** 作りかけのまま続けて取り直させる回数の上限（コミットのないワークツリーは HEAD がずっと 0 のため） */
const UNSETTLED_RETRIES = 10;
/** まだコミットを指していない HEAD（作りかけ・コミットのないワークツリー） */
const unborn = (w: GitWorktree) => !w.main && !w.prunable && /^0+$/.test(w.head);

/**
 * ブランチの切り替え・ワークツリーの足し引きを見張り、プロジェクトごとに知らせる（`startCore` が作り、知らせは SSE の `worktrees_changed`。画面が一覧を取り直す）。
 * 見張るのは本体と各ワークツリーの Git のフォルダ（HEAD があるところ。HEAD は名前を変えて置き換えられるので、ファイルではなくフォルダを見る）と、
 * 共有の Git のフォルダの `worktrees/`（足した・消した）。見張り始めるのは一覧の API が呼ばれたとき（`watch`。そのたびに一覧に合わせて付け外しする）。
 * 漏れても画面は 30 秒ごと・窓に戻ったときに取り直すので、見張れなかったフォルダは次の一覧で付け直すだけにする
 */
export class HeadWatch {
  private watches = new Map<number, Map<string, fs.FSWatcher>>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  /** プロジェクトごとの何回目の watch か（Git に聞いている間に次の watch が来たら、古い方は付け外ししない） */
  private generations = new Map<number, number>();
  /** 作りかけのワークツリーのために続けて取り直させた回数 */
  private retries = new Map<number, number>();
  private closed = false;
  constructor(private changed: (projectId: number) => void) {}

  async watch(projectId: number, repo: string, worktrees: GitWorktree[]): Promise<void> {
    const generation = (this.generations.get(projectId) ?? 0) + 1;
    this.generations.set(projectId, generation);
    const gitDirOf = async (dir: string, args: string[]) => (await git(dir).maybe(args)).trim();
    const dirs = await Promise.all(worktrees.filter((w) => !w.prunable).map((w) => gitDirOf(w.root, ["rev-parse", "--absolute-git-dir"])));
    const common = await gitDirOf(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (this.closed || this.generations.get(projectId) !== generation) return;
    // 作りかけのワークツリーは、仕上がるとき（作業中の印を外す・取り出す）に HEAD のフォルダを見張り始める前の変化しかないことがあるので、少しおいて取り直させる
    const retries = worktrees.some(unborn) ? (this.retries.get(projectId) ?? 0) + 1 : 0;
    this.retries.set(projectId, retries);
    if (retries > 0 && retries <= UNSETTLED_RETRIES) this.notifySoon(projectId, UNSETTLED_RETRY_MS);
    const list = common ? path.join(common, "worktrees") : "";
    const wanted = new Set([...dirs, common, list].filter(Boolean));
    let current = this.watches.get(projectId);
    if (!current) this.watches.set(projectId, (current = new Map()));
    for (const [dir, watcher] of current) {
      if (wanted.has(dir)) continue;
      watcher.close();
      current.delete(dir);
    }
    for (const dir of wanted) {
      if (current.has(dir)) continue;
      try {
        const watcher = fs.watch(dir, (_type, name) => {
          // ワークツリーの一覧のフォルダは何が変わっても、ほかは HEAD（共有の Git のフォルダでは worktrees/ の作成・削除も）だけ
          const file = name?.toString();
          if (dir !== list && file !== "HEAD" && !(dir === common && file === "worktrees")) return;
          this.notifySoon(projectId);
        });
        watcher.on("error", () => {
          watcher.close();
          current.delete(dir);
          this.notifySoon(projectId);
        });
        watcher.unref();
        current.set(dir, watcher);
      } catch {
        // まだない（worktrees/ はワークツリーを初めて足すまでない）・見張れないフォルダは、次の一覧で付け直す
      }
    }
  }

  private notifySoon(projectId: number, ms = SETTLE_MS): void {
    clearTimeout(this.timers.get(projectId));
    const timer = setTimeout(() => {
      this.timers.delete(projectId);
      this.changed(projectId);
    }, ms);
    timer.unref();
    this.timers.set(projectId, timer);
  }

  /** プロジェクトの見張りを外す（消した・アーカイブしたプロジェクト。次に一覧の API が呼ばれたら付け直す） */
  unwatch(projectId: number): void {
    this.generations.set(projectId, (this.generations.get(projectId) ?? 0) + 1);
    clearTimeout(this.timers.get(projectId));
    this.timers.delete(projectId);
    this.retries.delete(projectId);
    for (const watcher of this.watches.get(projectId)?.values() ?? []) watcher.close();
    this.watches.delete(projectId);
  }

  close(): void {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const watches of this.watches.values()) for (const watcher of watches.values()) watcher.close();
    this.timers.clear();
    this.watches.clear();
  }
}

/** 見張りを外すプロジェクト（消した・アーカイブした知らせなら、その ID。ほかは null） */
export function unwatchedProject(event: BusEvent): number | null {
  if (event.type === "project_deleted") return event.id;
  if (event.type === "project" && event.project.archived_at !== null) return event.project.id;
  return null;
}
