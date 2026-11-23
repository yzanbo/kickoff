// worktrees が作業場所に添える飾り: 札の説明にワークツリーの実行環境（アプリの URL と対応表 db 5432 → 20101）・作業場所の右の帯・ワークツリーを作る / 消す
import type { WorkplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { worktreeEnvLines } from "./worktreeEnvText";
import { WorktreeBar } from "./WorktreeBar";
import { worktreeActions } from "./worktreeActions";

export const worktreesDecor: WorkplaceDecor = {
  id: "worktrees",
  lines: (_projectId, path, list) => worktreeEnvLines((path && list?.find((w) => w.path === path)?.env) || null),
  Bar: WorktreeBar,
  actions: worktreeActions,
};
