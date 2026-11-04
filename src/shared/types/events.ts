// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { Approval } from "@shared/types/approval";
import type { AppSettings } from "@shared/types/settings";
import type { Project } from "@shared/types/project";
import type { PlanUsage } from "@shared/types/provider";
import type { ApiRetryInfo, BackgroundState, QueuedMessage, ReconnectState, Chat, ChatEvent, ChatGroup, SubagentInfo } from "@shared/types/chat";
import type { VoiceDownload } from "@shared/types/voice";

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "chat"; chat: Chat }
  | { type: "chat_deleted"; id: number; project_id: number }
  | { type: "group"; group: ChatGroup }
  | { type: "group_deleted"; id: number; project_id: number }
  | { type: "chat_event"; project_id: number; event: ChatEvent }
  /** 会話の記録の from_event_id から後ろ（それを含む）を消した（巻き戻し。画面の記録からも消す） */
  | { type: "chat_events_deleted"; project_id: number; chat_id: number; from_event_id: number }
  /** AI の返答の途中経過（保存しない。確定した文は chat_event の text で届く） */
  | { type: "chat_delta"; project_id: number; chat_id: number; text: string }
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  | { type: "chat_subagent"; project_id: number; chat_id: number; subagent: SubagentInfo }
  /** AI の API への通信を再試行しているところ（null で終わり） */
  | { type: "chat_retry"; project_id: number; chat_id: number; retry: ApiRetryInfo | null }
  /** 裏で動いている作業と、メインの返答が終わったか（null で作業が終わった） */
  | { type: "chat_background"; project_id: number; chat_id: number; background: BackgroundState | null }
  /** 会話を圧縮している最中か（since: 圧縮を始めた時刻。null で終わった） */
  | { type: "chat_compacting"; project_id: number; chat_id: number; since: string | null }
  /** 停止を頼んで、作業が終わるのを待っているか（false で終わった） */
  | { type: "chat_stopping"; project_id: number; chat_id: number; stopping: boolean }
  /** 通信が切れて止まり、つながったら自動で再開するのを待っているか（null で待っていない） */
  | { type: "chat_reconnect"; project_id: number; chat_id: number; reconnect: ReconnectState | null }
  /** 作業中のチャットに送った次の指示の待ちの列（変わるたびに全体を送る） */
  | { type: "chat_queue"; project_id: number; chat_id: number; queue: QueuedMessage[]; /** 終わっても自動で送らずに止めておくか */ paused: boolean; /** 「ここまで送ったら止めます」の印の位置（0 = 1 件目の上、n = n 件目のあと） */ stops: number[]; /** 次の指示を画面で書き直しているので、送らずに書き直しが終わるのを待っている（作業は終わり、送信の準備ができている） */ waiting_edit: boolean }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; chat_id: number }
  | { type: "settings"; settings: AppSettings }
  | { type: "usage"; usage: PlanUsage }
  /** 音声入力のモデルのダウンロードの進み具合（download が null なら終わった・やめた。downloaded はファイルがあるか） */
  | { type: "voice_model"; id: string; download: VoiceDownload | null; downloaded: boolean };
