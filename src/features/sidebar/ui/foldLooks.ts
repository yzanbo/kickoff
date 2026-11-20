// サイドバーの開閉の見出しの見た目（FoldHead の look。控えめなまとまりは土台の FOLD_ROW）
import type { FoldLook } from "@/foundation/ui/kit/FoldHead";

/** 自分で作ったグループ（件数は名前の後ろ） */
export const FOLD_GROUP: FoldLook = { wrap: "custom-group", head: "custom-group-head", name: "custom-group-name", count: "custom-group-count" };

/** 並べ方のまとまり（状態・作業場所。件数は名前のボタンの中） */
export const FOLD_SECTION: FoldLook = { wrap: "status-group", head: "status-group-head", name: "status-group-name", count: "status-group-count", countInName: true };
