// 通知の取り決めに出る型（見ているものの知らせ）

/**
 * いま見ているもの（PUT /api/viewing。この Mac の画面・端末がそれぞれ知らせる）。前に出ていなければ両方 null。
 * だれかが見ているチャット・CI のタブの知らせは、どこにも通知しない（見ているので要らない）
 */
export interface ViewingBody {
  /** 開いて前に出しているチャット */
  chat_id: number | null;
  /** 開いて前に出している CI のタブのプロジェクト */
  ci_project_id: number | null;
}

/** 見ているものの知らせを覚えておく時間（画面は前に出している間、これより短い間隔で知らせ直す） */
export const VIEWING_TTL_MS = 90_000;
