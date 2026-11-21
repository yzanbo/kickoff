// チャットの実行の状態の型（純粋。Node・店・時計を読まない）。作業ごとの状態 TurnState の中身の言葉
import type { CompactTrigger } from "@shared/ai/turnEvents";

/** 作業の種類（ふつうの指示・手で圧縮する前の圧縮前指示・手で圧縮する実行・圧縮後指示の作業・再開） */
export type TurnKind = "message" | "pre_compact" | "compact" | "post_compact" | "resume";

/** いまの作業に「いま」を足す口: まだ / 足せる / 入力が閉じた（作業が終わるまで預かる）/ 手で圧縮する実行（足さない） */
export type TellGate = "opening" | "open" | "closed" | "never";

/**
 * 作業の中の圧縮の様子。圧縮前指示から圧縮が終わるまで・作業中に手で頼んだ圧縮・圧縮中・圧縮したやり取りの途中は、
 * 同じ作業の中で重なることがある（手で圧縮する実行は待つ間と圧縮中と圧縮したあとが重なり、自動の圧縮が失敗すると待つ間と圧縮したあとが重なる）ので、
 * 1 つの段階にせず並べて持つ
 */
export interface Compaction {
  /** 圧縮前指示を送ってから、圧縮が終わるまで（最後まで終わってまだ圧縮していなければ、続けて圧縮する） */
  awaiting: boolean;
  /** 作業中に手で頼んだ圧縮の圧縮前指示を足した（この作業が最後まで終わったら、手で頼んだ圧縮として圧縮する） */
  afterTurn: boolean;
  /** 圧縮中（始めた時刻は終わるまで変えない） */
  running: { since: string; trigger: CompactTrigger } | null;
  /** 圧縮したやり取りの途中（この間の「いま」は預かる） */
  done: boolean;
}

/** AI の切り替えの引き継ぎの門（DB の写し。null = 引き継ぎなし / ready = 送ってよい / blocked = 準備できていない / sending = 送っている途中 / uncertain = 受け取ったか分からない） */
export type HandoffGate = null | "ready" | "blocked" | "sending" | "uncertain";
