// 圧縮を待っている指示（ChatLive の now）の吹き出しの下に添える、いつ送るかの文（純粋関数）

/**
 * 預かった指示をいつ送るか: compact = 圧縮が終わるのを待っている / exchange = 圧縮のあとのやり取り（圧縮後指示か、圧縮のあとの続き）の途中 /
 * closed = いまの作業に足せなくなった（Claude Code が手を空けて入力を閉じた。作業の終わりに送信待ちより先に送る）/
 * turn = 圧縮を待たずに残っている（作業中。いまの作業に伝える）/ next = 作業していないのに残っている（次に送る指示と一緒に伝える）
 */
export type AfterCompactUntil = "compact" | "exchange" | "closed" | "turn" | "next";

/** 吹き出しの下に添える、いつ送るかの文（post はその吹き出しが圧縮後指示か、hasPost は圧縮後指示の吹き出しがあるか） */
export function afterCompactLabelOf(until: AfterCompactUntil, post: boolean, hasPost: boolean): string {
  if (until === "next") return "次に送る指示と一緒に伝えます";
  if (until === "closed") return post ? "この作業が終わったら、最初に送ります" : "この作業が終わったら送ります";
  if (until === "turn" || (until === "exchange" && post)) return "いまの作業に伝えます";
  if (until === "exchange") return "このやり取りが終わったら送ります";
  if (post) return "圧縮が終わったら、最初に送ります";
  return hasPost ? "圧縮後指示のやり取りが終わったら送ります" : "圧縮のあとのやり取りが終わったら送ります";
}
