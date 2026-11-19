import type { Approval } from "@shared/chat/approvalTypes";
import type { AppSettings, ProviderId } from "@shared/settings/types";
import type { Project } from "@shared/projects/types";
import type { CodexCredits, PlanUsage } from "@shared/ai/types";
import type { Chat, ChatGroup, ChatImageHost } from "@shared/chat/types";
import type { ChatEvent, CommandOutput, HandoffFrom, SubagentInfo } from "@shared/chat/chatEvent";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Snippet } from "@shared/snippets/types";
import type { VoiceDownload } from "@shared/voice/types";
import type { WorktreePrNotice } from "@shared/git/types";
import type { CiFailure } from "@shared/github/ciTypes";
import type { PairingState } from "@shared/devices/types";

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "chat"; chat: Chat }
  /** AI からの知らせ（AI の notify_user。通知の中心が、そのチャットを見ていない人に Mac の通知・プッシュを送る。端末の SSE には届けない） */
  | { type: "ai_notice"; project_id: number; chat_id: number; message: string }
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
  | {
      type: "chat_delta";
      project_id: number;
      chat_id: number;
      text: string;
      /** 書きかけの返答の中で text が始まる位置（UTF-16 の長さ。コアのバスが流すときに付ける。チャットの詳細の streaming_length と同じ数え方） */
      offset: number;
    }
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
  /** Codex のクレジットの様子が変わった（実行中の知らせ・使用状況の取得で、残りが減った・枠に空きが戻ったなど） */
  | { type: "codex_credits"; credits: CodexCredits }
  /** 音声入力のモデルのダウンロードの進み具合（download が null なら終わった・やめた。downloaded はファイルがあるか） */
  | { type: "voice_model"; id: string; download: VoiceDownload | null; downloaded: boolean }
  /** プロジェクトのメモを作った・書いた・動かした・ゴミ箱へ移した（Kickoff の中の操作だけ。一覧と開いているメモを取り直す） */
  | { type: "memos"; project_id: number; path: string | null }
  /** プロジェクトのブランチを替えた・ワークツリーを足した・消した（コアの HEAD の見張り。画面はワークツリーの一覧を取り直す） */
  | { type: "worktrees_changed"; project_id: number }
  // ワークツリーの PR の知らせ（そのプロジェクトの分を丸ごと。変わったときだけ）
  | { type: "worktree_prs"; project_id: number; notices: WorktreePrNotice[] }
  /** チャットで外の画像の表示を許可したホストが変わった（そのチャットの分を丸ごと。端末には届けない） */
  | { type: "chat_image_hosts"; project_id: number; chat_id: number; hosts: ChatImageHost[] }
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
  | { type: "ports_changed"; count: number; fresh: number }
  /** スマホ連携のペアリングの様子が変わった（番号・確かめを待っている頼み。この Mac の画面だけに届ける） */
  | { type: "pairing"; state: PairingState }
  /** つないだ端末の一覧が変わった（中身は送らない。画面は読み直す） */
  | { type: "devices" }
  /** Kickoff のゴミ箱の中身が変わった（入れた・戻した・消えた。project_id は出すプロジェクト。画面は「ゴミ箱」タブを読み直す） */
  | { type: "trash"; project_id: number | null }
  /**
   * AI のブラウザでのログインが終わった（設定の「接続」の「ブラウザでログイン」。POST /api/providers/:id/login で始めたもの。
   * completed = ログインした / failed = できなかった（error に理由）/ cancelled = やめた。画面は AI の状態を読み直す。この Mac の画面だけに届ける）
   */
  | { type: "provider_login"; provider: ProviderId; status: ProviderLoginStatus; error: string | null };

/** ブラウザでのログインの終わり方 */
const PROVIDER_LOGIN_STATUSES = ["completed", "failed", "cancelled"] as const;
type ProviderLoginStatus = (typeof PROVIDER_LOGIN_STATUSES)[number];

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
