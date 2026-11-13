// ワークツリーの実行環境（ワークツリーごとにポートの帯と Docker の組の名前を分ける。メモの仕様書「ワークツリーの実行環境」）
import type { Chat } from "./chat";
import type { GitWorktree } from "./git";

/** 帯の中の 1 つの番号の割り当て（+00 は開発サーバー、+01 から先は Docker の公開ポート） */
export interface WorktreePortSlot {
  kind: "dev" | "docker";
  /** compose のファイルがあるフォルダ（プロジェクトのフォルダからの相対。直下は ""。開発サーバーは null） */
  compose_dir: string | null;
  /** compose のサービス名（開発サーバーは null） */
  service: string | null;
  /** コンテナ側の番号（開発サーバーは null） */
  target: number | null;
  /** プロトコル（tcp / udp。開発サーバーは null） */
  protocol: string | null;
  /** 本体で Mac に出している番号（本体が出していない・開発サーバーは null） */
  original: number | null;
  /** このワークツリーで使う番号（帯の中） */
  port: number;
}

/** compose のフォルダごとに割り当てた組の名前 */
export interface WorktreeComposeName {
  /** compose のファイルがあるフォルダ（プロジェクトのフォルダからの相対。直下は ""） */
  dir: string;
  name: string;
}

/** ワークツリーの実行環境（API の形。ワークツリーの一覧の env） */
export interface WorktreeEnv {
  /** 帯の先頭（20100 など）。分けていなければ null */
  band: number | null;
  /** 埋め込みブラウザで開く名前（<ブランチ名>.localhost） */
  host: string | null;
  /** アプリの URL（http://<host>:<帯+00>）。帯がなければ null */
  app_url: string | null;
  slots: WorktreePortSlot[];
  /** Kickoff が割り当てた組の名前（割り当てたものだけ。消すときに down -v を出すかの目印） */
  compose_names: WorktreeComposeName[];
  /** 書き換えた変数（「.env の DATABASE_URL」の形） */
  rewritten: string[];
  /** 手順で整えきれていない所（利用者に知らせる） */
  issues: string[];
  /** 分けられない理由（Git で管理している .env・帯を使い切ったなど。分けられたら null） */
  blocked: string | null;
}

/** 帯の範囲（20000〜29999 を 100 ずつ。20000〜20099 は使わない） */
export const WORKTREE_BAND_FIRST = 20100;
export const WORKTREE_BAND_LAST = 29900;
export const WORKTREE_BAND_SIZE = 100;

/** 対応表の 1 行の文（「db 5432 → 20101」「開発サーバー PORT → 20100」） */
export function worktreeSlotLabel(slot: WorktreePortSlot): string {
  if (slot.kind === "dev") return `開発サーバー PORT → ${slot.port}`;
  const where = slot.compose_dir ? `${slot.compose_dir}/${slot.service}` : slot.service;
  const proto = slot.protocol && slot.protocol !== "tcp" ? `/${slot.protocol}` : "";
  return `${where} ${slot.original ?? slot.target}${proto} → ${slot.port}`;
}

/** ［AI で整える］を頼む（POST …/git/worktrees/env-setup。path は作業するフォルダ） */
export interface WorktreeEnvSetupBody {
  path: string;
}

/** ［AI で整える］の結果: 作ったチャット（Git で管理していないファイルだけを書ける）と、手順を流したあとのワークツリーの一覧 */
export interface WorktreeEnvSetupResult {
  chat: Chat;
  worktrees: GitWorktree[];
}
