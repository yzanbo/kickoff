import type { BoardColumn } from "@shared/chat/types";

// チャットの急ぐ順（ボードの列・⌘⇧A のまとまり・スマホの一覧が同じ表を読む）

/** 急ぐ順 = ボードの列の順（作業中 → 回答待ち → 未読 → 既読）。スマホもこれに合わせる（U5 の既定: ボードに合わせる。変えるときはこの順だけ） */
export const URGENCY_ORDER = ["running", "needs_input", "unread", "read"] as const satisfies readonly BoardColumn[];

/** 数を出す状態の急ぐ順（既読を除く。⌘⇧A のまとまり・状態の絞り込み） */
export const ACTIVE_URGENCY = URGENCY_ORDER.filter((c): c is Exclude<BoardColumn, "read"> => c !== "read");

const RANK = new Map<BoardColumn, number>(URGENCY_ORDER.map((c, i) => [c, i]));

/** 急ぐ順に並べる比べ方（急ぐものが前） */
export const byUrgency = (a: BoardColumn, b: BoardColumn): number => (RANK.get(a) ?? 0) - (RANK.get(b) ?? 0);
