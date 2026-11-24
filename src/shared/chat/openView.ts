// AI が画面に頼む「開く」と「下書きを入れる」の中身（SSE の open_view・chat_draft）
import type { HandoffFrom } from "./chatEvent";
import type { Chat } from "./types";

/** AI が開くときの場所（side = いちばん上の親チャットの画面の右の欄 / window = 別ウィンドウ） */
export const OPEN_PLACES = ["side", "window"] as const;
export type OpenPlace = (typeof OPEN_PLACES)[number];
export const OPEN_PLACE_LABELS: Record<OpenPlace, string> = { side: "右の欄", window: "別ウィンドウ" };

/**
 * AI が画面に頼む「開く」の中身。place が null なら画面の設定の開き方（ノート = チャットからノートを開く場所・子チャット = 子チャットを開く場所）。
 * lineage は、いちばん上の親チャットから、頼んだチャット（ノート）・開くチャット（チャット）までの並び（画面がまだ読み込んでいない子チャットでも、親をたどって右の欄に開けるように）
 */
export type OpenViewRequest =
  | { kind: "note"; project_id: number; path: string; place: OpenPlace | null; lineage: Chat[] }
  | { kind: "chat"; place: OpenPlace | null; lineage: Chat[] }
  /** 頼んだチャットの作業場所のファイル（path は作業場所からの相対パス。line は目立たせる行） */
  | { kind: "file"; project_id: number; worktree: string | null; path: string; line: number | null; place: OpenPlace | null; lineage: Chat[] }
  /** 頼んだチャットの作業場所のコミットしていない変更（path を渡せばそのファイルの位置へ） */
  | { kind: "diff"; project_id: number; worktree: string | null; path: string | null; place: OpenPlace | null; lineage: Chat[] }
  /** 頼んだチャットの右の欄の DB クライアントの、その接続の新しい SQL のタブに sql を入れて開く（流さない） */
  | { kind: "sql"; project_id: number; connection_id: number; sql: string; lineage: Chat[] };

/**
 * AI が家系のチャットの入力欄に入れる下書き（書きかけの後ろに空行を挟んで足す。送るのは利用者）。lineage はいちばん上の親チャットから入れる先のチャットまで、
 * from は入れる先が頼んだチャットの親チャットのとき、頼んだ子チャット（画面の「子チャットから渡した」の札と同じ）
 */
export interface ChatDraftRequest {
  text: string;
  from: HandoffFrom | null;
  lineage: Chat[];
}
