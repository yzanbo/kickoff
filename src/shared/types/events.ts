// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { Approval } from "./approval";
import type { AppSettings } from "./settings";
import type { Project } from "./project";
import type { PlanUsage } from "./provider";
import type { Chat, ChatGroup } from "./chat";
import type { ChatEvent, CommandOutput, HandoffFrom, SubagentInfo } from "./chatEvent";
import type { ChatLive } from "./chatLive";
import type { Snippet } from "./snippet";
import type { VoiceDownload } from "./voice";
import type { WorktreePrNotice } from "./git";
import type { CiFailure } from "./ci";

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "chat"; chat: Chat }
  | { type: "chat_deleted"; id: number; project_id: number }
  | { type: "group"; group: ChatGroup }
  | { type: "group_deleted"; id: number; project_id: number }
  /** 定型文を作った・変えた・並べ替えた（並べ替えはすべての定型文を 1 件ずつ）。プロジェクトを消して一緒に消えたものは project_deleted で外す */
  | { type: "snippet"; snippet: Snippet }
  | { type: "snippet_deleted"; id: number }
  | { type: "chat_event"; project_id: number; event: ChatEvent }
  /** 会話の記録の from_event_id から後ろ（それを含む）を消した（巻き戻し。画面の記録からも消す） */
  | { type: "chat_events_deleted"; project_id: number; chat_id: number; from_event_id: number }
  /** AI の返答の途中経過（保存しない。確定した文は chat_event の text で届く） */
  | { type: "chat_delta"; project_id: number; chat_id: number; text: string }
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  | { type: "chat_subagent"; project_id: number; chat_id: number; subagent: SubagentInfo }
  /** 実行中のコマンドの出力の終わりの部分（増えるたびに丸ごと。保存しない。結果はツールの結果の記録で届く） */
  | { type: "chat_command_output"; project_id: number; chat_id: number; output: CommandOutput }
  /** 作業中の様子（送信待ち・裏の作業・再試行・再接続待ち・圧縮中・停止中）。どれかが変わるたびに全体を送る（チャットの詳細の live と同じ形） */
  | { type: "chat_live"; project_id: number; chat_id: number; live: ChatLive }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; chat_id: number }
  | { type: "settings"; settings: AppSettings }
  | { type: "usage"; usage: PlanUsage }
  /** 音声入力のモデルのダウンロードの進み具合（download が null なら終わった・やめた。downloaded はファイルがあるか） */
  | { type: "voice_model"; id: string; download: VoiceDownload | null; downloaded: boolean }
  /** プロジェクトのメモを作った・書いた・動かした・ゴミ箱へ移した（Kickoff の中の操作だけ。一覧と開いているメモを取り直す） */
  | { type: "memos"; project_id: number; path: string | null }
  // ワークツリーの PR の知らせ（そのプロジェクトの分を丸ごと。変わったときだけ）
  | { type: "worktree_prs"; project_id: number; notices: WorktreePrNotice[] }
  /** DB の接続の一覧が変わった（中身は送らない。端末には届けない = http/deviceAccess.ts） */
  | { type: "db_connections"; project_id: number }
  /** DB の接続につないだ・切れた（木・テーブル・SQL のタブの接続が 1 つでも開いているか。DB タブの左の一覧の印） */
  | { type: "db_connection_state"; project_id: number; connection_id: number; connected: boolean }
  /** Docker タブ: そのプロジェクトのコンテナ・操作の様子が変わった（受けた画面は一覧を取り直す） */
  | { type: "docker_changed"; project_id: number }
  /** 見張っているブランチの CI が落ちた（同じ実行は 1 回だけ。画面は設定の「通知」に合わせて Mac の通知を出し、CI のタブを取り直す） */
  | { type: "ci_failed"; failure: CiFailure }
  /** チャットの AI が、メモ・家系のチャット・ファイル・差分・SQL を開くよう頼んだ（Mac のアプリのメインのウィンドウだけが受けて開く。kickoff_chat の open_…） */
  | { type: "open_view"; request: OpenViewRequest }
  /** チャットの AI が、家系のチャットの入力欄に下書きを入れるよう頼んだ（Mac のアプリのメインのウィンドウだけが受けて入れる。kickoff_chat の add_draft） */
  | { type: "chat_draft"; request: ChatDraftRequest }
  /**
   * ポートを使っているプロセスを調べ直した（数だけ。一覧はコマンドの全文を含むので SSE に載せず、この Mac の画面が GET /api/ports?cached=1 で読む。
   * SSE はスマホの画面にも届くため）。fresh は、チャットの実行が終わったあとに調べて新しく現れたものの数
   * （画面は下の帯の「ポート n」のボタンに点を付ける。窓を開いた・↻・止めたあとに調べたときは 0）
   */
  | { type: "ports_changed"; count: number; fresh: number };

/** AI が開くときの場所（side = いちばん上の親チャットの画面の右の欄 / window = 別ウィンドウ） */
export const OPEN_PLACES = ["side", "window"] as const;
export type OpenPlace = (typeof OPEN_PLACES)[number];
export const OPEN_PLACE_LABELS: Record<OpenPlace, string> = { side: "右の欄", window: "別ウィンドウ" };

/**
 * AI が画面に頼む「開く」の中身。place が null なら画面の設定の開き方（メモ = チャットからメモを開く場所・子チャット = 子チャットを開く場所）。
 * lineage は、いちばん上の親チャットから、頼んだチャット（メモ）・開くチャット（チャット）までの並び（画面がまだ読み込んでいない子チャットでも、親をたどって右の欄に開けるように）
 */
export type OpenViewRequest =
  | { kind: "memo"; project_id: number; path: string; place: OpenPlace | null; lineage: Chat[] }
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
