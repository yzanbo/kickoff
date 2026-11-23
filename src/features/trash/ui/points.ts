// ゴミ箱の行の描き方の拡張点: 種類の持ち主（file = trash・chat / session = chat・project = projects・worktree = worktrees）が、行のアイコンと「誰が消したか」の欄を登録する
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { TrashItem, TrashKind } from "@shared/trash/types";
import { definePoint } from "@/foundation/ui/points";

export interface TrashKindView {
  kind: TrashKind;
  icon(item: TrashItem): LucideIcon;
  /** 誰が消したかの欄（チャットの AI が消したものはいつもその AI。null なら出さない。省けば「あなた」） */
  By?: ComponentType<{ item: TrashItem }> | null;
  /** 消した時刻のあとに添える文（プロジェクトの「 に削除」） */
  trashedSuffix?: string;
}

export const trashKinds = definePoint<TrashKindView>("trashKinds", { key: (v) => v.kind });

/** 種類の描き方（登録がなければ null） */
export const trashKindView = (kind: TrashKind): TrashKindView | null => trashKinds.items().find((v) => v.kind === kind) ?? null;
