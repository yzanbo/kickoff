// ゴミ箱の種類 worktree（消したワークツリーの控え）の行の描き方
import { GitBranch } from "lucide-react";
import type { TrashKindView } from "@/features/trash/ui";

export const worktreeTrashKind: TrashKindView = { kind: "worktree", icon: () => GitBranch };
