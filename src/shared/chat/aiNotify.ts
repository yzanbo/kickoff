// チャットの AI が利用者に知らせるツール（kickoff_chat の notify_user。メモの仕様書「0019_AI の操作ツールの追加」の C）の、コアと画面で共有する名前・上限と、記録の文

/** 利用者に知らせるツールの名前 */
export const AI_NOTIFY_USER_TOOL = "mcp__kickoff_chat__notify_user";

/** 知らせる文の長さの上限（文字） */
export const AI_NOTIFY_MESSAGE_MAX = 120;

/** 1 回の作業（Turn）で知らせられる回数 */
export const AI_NOTIFY_PER_TURN = 3;

/** チャットの流れに残すお知らせの文（あとで何を知らせたか分かるように） */
export const aiNoticeLine = (message: string) => `AI からの知らせ: ${message}`;

/** 記録の行に出す文（知らせた文） */
export function describeNotifyUser(input: Record<string, unknown>): string {
  return typeof input.message === "string" ? input.message : "";
}
