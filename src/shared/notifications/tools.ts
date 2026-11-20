// チャットの AI が利用者に知らせるツール（kickoff_chat の notify_user）の、コアと画面で共有する上限・記録の文・表示の表
import type { AiToolView } from "@shared/foundation/aiToolView";

/** 知らせる文の長さの上限（文字） */
export const AI_NOTIFY_MESSAGE_MAX = 120;

/** 1 回の作業（Turn）で知らせられる回数 */
export const AI_NOTIFY_PER_TURN = 3;

/** チャットの流れに残すお知らせの文（あとで何を知らせたか分かるように） */
export const aiNoticeLine = (message: string) => `AI からの知らせ: ${message}`;

/** 利用者に知らせるツール（記録の行は知らせた文） */
export const NOTIFY_USER_VIEW: AiToolView = {
  server: "kickoff_chat",
  name: "notify_user",
  label: "利用者に知らせる",
  describe: (input) => (typeof input.message === "string" ? input.message : ""),
};

/** 通知の機能のツールの表示の表 */
export const NOTIFICATION_TOOL_VIEWS: readonly AiToolView[] = [NOTIFY_USER_VIEW];
