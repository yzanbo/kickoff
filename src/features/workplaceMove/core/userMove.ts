// 利用者が画面からチャットの作業場所を移す: 移す前の確かめの中身と、
// 移す先の決め方（本体・いまあるワークツリー・新しいワークツリー）・変更を持っていく・移せないとき
import fs from "node:fs";
import type { Chat } from "@shared/chat/types";
import type { WorkplaceMoveBody, WorkplaceMoveCheck } from "@shared/foundation/apiTypes";
import type { Project } from "@shared/projects/types";
import { carryFiles, applyCarry, dropCarry, stashForCarry, type CarriedChanges } from "@/foundation/core/workplace/carry";
import type { WorkplaceKit } from "@/foundation/core/workplace/kit";
import { isGitWorkTree } from "@/foundation/core/workplace/reads";
import { findWorktree, newWorktreeProblem, removeWorktree, worktreePathFor } from "@/foundation/core/workplace/worktrees";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { workdirOf } from "@/features/chat/core/index";
import type { WorkplaceMoveInput, WorkplaceMoveSteps } from "./move";
import type { RunningTerminal, RunningTerminalsPort } from "./target";

export interface WorkplaceUserMoveDeps {
  /** 片付けを予約したワークツリー（chat の作業の終わりの予約の reservedFolders） */
  reservedFolders: () => Set<string>;
  /** 作業場所で動いている内蔵ターミナル（terminal が登録した口。なければ見ない） */
  terminals: () => RunningTerminalsPort | null;
  /** ワークツリーを作る人（作業場所の土台。worktrees が登録する） */
  workplace: Pick<WorkplaceKit, "creator">;
}

/** 移せない理由（実行環境を整えるチャット・Git でないプロジェクト。移せれば null） */
export async function workplaceMoveBlocked(chat: Chat, project: Project): Promise<string | null> {
  if (chat.untracked_only) return "実行環境を整えるチャットは、そのワークツリーのためのものなので作業場所を移せません";
  if (!(await isGitWorkTree(project.repo_path))) return "Git で管理していないプロジェクトにはワークツリーがないので、作業場所を移せません";
  return null;
}

/** 元の作業場所で動いている内蔵ターミナル（名前とコマンド） */
export function runningTerminals(deps: Pick<WorkplaceUserMoveDeps, "terminals">, dir: string, projectId: number): RunningTerminal[] {
  return deps.terminals()?.in(dir, projectId) ?? [];
}

/** 移す前の確かめの中身: 元の作業場所に残るコミットしていない変更・そこで動いているターミナル・移す先にできないワークツリー */
export async function workplaceMoveCheck(deps: WorkplaceUserMoveDeps, chat: Chat, project: Project): Promise<WorkplaceMoveCheck> {
  const dir = workdirOf(chat, project);
  const missing = !fs.existsSync(dir);
  const blocked = await workplaceMoveBlocked(chat, project);
  const changes = missing || blocked ? [] : await carryFiles(dir).catch((): string[] => []);
  const terminals = runningTerminals(deps, dir, project.id);
  return { changes, terminals, reserved: [...deps.reservedFolders()], blocked, missing };
}

/**
 * 画面から移すときの、移す先と移す前後の段を決める（確かめは移す口 move の前に済ませる）。
 * 新しいワークツリーは、このチャットのいまの作業場所のいまのコミットから作る。持っていくのは新しいワークツリーのときだけ
 */
export async function planUserWorkplaceMove(
  deps: WorkplaceUserMoveDeps,
  chat: Chat,
  project: Project,
  body: WorkplaceMoveBody,
  reason: "user" | "ai" = "user",
): Promise<{ input: WorkplaceMoveInput; steps?: WorkplaceMoveSteps }> {
  const blocked = await workplaceMoveBlocked(chat, project);
  if (blocked) throw new Invalid(blocked);
  const fromDir = workdirOf(chat, project);
  const fromExists = fs.existsSync(fromDir);
  const branch = body.new_worktree_branch?.trim();
  if (body.carry && !branch) throw new Invalid("コミットしていない変更を持っていけるのは、新しいワークツリーへ移すときだけです（いまある作業場所の変更とぶつかりうるため）");
  if (body.carry && !fromExists) throw new Invalid("元の作業場所のフォルダがないので、変更は持っていけません");

  if (!branch) {
    const target = body.worktree_path === null ? null : await findWorktree(project.repo_path, body.worktree_path);
    if (target === undefined) throw new Invalid("このプロジェクトのワークツリーではありません");
    if (target?.prunable || (target && !fs.existsSync(target.path))) throw new NotFound("移す先のワークツリーのフォルダが見つかりません");
    const worktreePath = target && !target.main ? target.path : null;
    if (worktreePath === chat.worktree_path) throw new Invalid("いまと同じ作業場所です");
    if (worktreePath && deps.reservedFolders().has(worktreePath)) throw new Invalid("このワークツリーは片付けを予約しているので、移す先にできません（片付けが済むと、そこのチャットは本体に戻ります）");
    return { input: { worktreePath, reason } };
  }

  const problem = await newWorktreeProblem(project.repo_path, branch);
  if (problem) throw new Invalid(problem);
  const worktreePath = await worktreePathFor(project.repo_path, branch);
  let carried: CarriedChanges | null = null;
  let created = false;
  // 新しいワークツリーと持っていった変更を片付けて、元のまま（変更は元の場所）に戻す
  const rollback = async () => {
    if (carried) await applyCarry(fromDir, carried).catch(() => {});
    if (created) await removeWorktree(project.repo_path, worktreePath, { force: true, deleteBranch: true }).catch(() => {});
    if (carried) await dropCarry(fromDir, carried).catch(() => {});
  };
  return {
    input: { worktreePath, reason },
    steps: {
      before: async () => {
        // いまの作業場所のいまのコミットから（その作業場所でのコミットも入る）。フォルダがなければ本体の HEAD から
        await deps.workplace.creator().createWorktree({ projectId: project.id, repoPath: project.repo_path }, branch, fromDir);
        created = true;
        if (!body.carry) return {};
        try {
          carried = await stashForCarry(fromDir);
          if (carried) await applyCarry(worktreePath, carried);
        } catch (e) {
          await rollback();
          created = false;
          carried = null;
          throw new Invalid(`コミットしていない変更を持っていけなかったので、作業場所を移しませんでした（${e instanceof Error ? e.message : String(e)}）`);
        }
        return carried ? { carried: true } : {};
      },
      after: async () => {
        if (carried) await dropCarry(fromDir, carried).catch(() => {});
      },
      undo: rollback,
    },
  };
}

