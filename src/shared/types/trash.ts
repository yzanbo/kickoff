// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// Kickoff のゴミ箱（消したものを 3 日だけ取っておき、元に戻せる。メモの仕様書「ファイル削除」）

/**
 * ゴミ箱に入れたものの種類（file = ファイル・フォルダ（メモも）/ chat = チャット（子チャット・会話記録・添付ごと）/ project = プロジェクト / session = 持ち主のいない会話記録 /
 * worktree = 消したワークツリーの控え（取り込んでいないコミット・途中の変更。戻すと同じ名前でワークツリーを作り直す）
 */
export const TRASH_KINDS = ["file", "chat", "project", "session", "worktree"] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

/** ゴミ箱に入れてから本当に消すまで（3 日。AI の rm も画面から消したものも同じ） */
export const TRASH_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

/** ゴミ箱に入れたもの（trash_items の表） */
export interface TrashItem {
  /** ID（置き場のフォルダ名。AI の kickoff-trash が付けたものもそのまま使う） */
  id: string;
  /** どのプロジェクトのゴミ箱に出すか（消したチャット・画面のプロジェクト。分からなければ null = どこにも出さない） */
  project_id: number | null;
  kind: TrashKind;
  /** 一覧に出す名前（ファイル名・チャットの名前・プロジェクトの名前） */
  label: string;
  /** 元の場所（ファイルの絶対パス。チャット・プロジェクトは null） */
  origin: string | null;
  is_dir: boolean;
  /** 大きさ（バイト。数え終わるまでは null） */
  size: number | null;
  /** チャットなら、ゴミ箱に入れたチャット（子チャットも一緒） */
  chat_id: number | null;
  /** AI が消したなら、そのチャット（利用者が画面から消したなら null） */
  by_chat_id: number | null;
  /** by_chat_id のチャットの名前（もうなければ null） */
  by_chat_title: string | null;
  trashed_at: string;
  /** 本当に消える時刻（trashed_at ＋ 3 日） */
  expires_at: string;
}

/** ゴミ箱に入れた結果（画面の「元に戻す」で使うゴミ箱の ID） */
export interface TrashedResult {
  trash_id: string;
}

/** 元に戻す本文（rename: 元の場所に同じ名前があれば、別の名前で戻す） */
export interface TrashRestoreBody {
  rename?: boolean;
}

/** 元に戻した結果（戻した場所。チャット・プロジェクトは null） */
export interface TrashRestoreResult {
  path: string | null;
}

/** 元に戻せないとき（元の場所に同じ名前がある）の印。画面が「別の名前で戻す」を聞く */
export const TRASH_RESTORE_EXISTS = "trash_restore_exists";

/** アーカイブ済みのチャットの整理（メモの仕様書「ファイル削除」の Q19）で選べる日数（それより動いていないものをまとめてゴミ箱へ） */
export const ARCHIVE_CLEANUP_DAYS = [7, 30, 90, 180, 365] as const;
export type ArchiveCleanupDays = (typeof ARCHIVE_CLEANUP_DAYS)[number];
export const ARCHIVE_CLEANUP_DAYS_LABELS: Record<ArchiveCleanupDays, string> = { 7: "1 週間", 30: "30 日", 90: "90 日", 180: "180 日", 365: "1 年" };

/** 整理の見込み（GET /api/archive-cleanup?days=） */
export interface ArchiveCleanupPreview {
  days: number;
  /** ゴミ箱に入れるチャットの数（一緒に入る子チャットも数える） */
  count: number;
  /** 会話記録のファイルの大きさの合計（バイト。数えられなければ null） */
  size: number | null;
}

/** 整理する（POST /api/archive-cleanup） */
export interface ArchiveCleanupBody {
  days: number;
}

/** 整理した結果 */
export interface ArchiveCleanupResult {
  /** ゴミ箱に入れたチャットの数（子チャットも数える） */
  trashed: number;
}

/** どのチャットも使っていない会話記録（GET /api/orphan-sessions。メモの仕様書「ファイル削除」の Q17 の「いまある分」） */
export interface OrphanSession {
  session_id: string;
  provider: string;
  size: number;
  modified_at: string;
  /** 動かした作業フォルダ（分からなければ null） */
  cwd: string | null;
  /** 最初の自分の発言（頭の 200 文字。なければ null） */
  first_prompt: string | null;
  /** 作業フォルダを含むプロジェクト（ゴミ箱に入れたらそのプロジェクトの「ゴミ箱」に出る。なければ null） */
  project_id: number | null;
  /** Kickoff の 1 回だけの問い合わせ（チャットの名前付け・要約など。一時フォルダで動かしたもの）の記録か。いまは残さないが、前の版が残したもの */
  kickoff_ask: boolean;
}

/** 選んだ会話記録をゴミ箱へ入れる（POST /api/orphan-sessions/trash） */
export interface OrphanSessionsTrashBody {
  session_ids: string[];
}
