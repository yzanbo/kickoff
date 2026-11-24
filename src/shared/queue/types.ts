// 送信待ちの取り決めに出る形（起動したときの再開の確かめ）
import type { RestartResumeAction } from "@shared/chat/chatLive";

/** 起動したときの再開の確かめに答える（POST /api/restart-resumes。チャットごと） */
export interface RestartResumeBody {
  decisions: { chat_id: number; action: RestartResumeAction }[];
}
