// 画面から届く IPC の引数の検査（Electron に依らないので、テストできる）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS, type ExternalBrowserId, type ExternalTerminalId } from "@shared/types";

/** よく使う拡張機能の Chrome ウェブストア ID */
export const KNOWN_EXTENSIONS = {
  "react-devtools": { id: "fmkadmapgofadopljbjfkapdkoienihi", name: "React Developer Tools" },
} as const;

export type KnownExtensionKey = keyof typeof KNOWN_EXTENSIONS;

/** 対応している拡張機能のキーか確かめる */
export function knownExtension(key: unknown): KnownExtensionKey {
  // in だと Object.prototype の名前（toString など）も通ってしまうので、自分の項目だけを見る
  if (typeof key !== "string" || !Object.hasOwn(KNOWN_EXTENSIONS, key)) throw new Error("未対応の拡張機能です");
  return key as KnownExtensionKey;
}

/** 埋め込みブラウザ（WebContents）の ID の指定か確かめる */
export function webContentsId(value: unknown): number {
  if (typeof value !== "number") throw new Error("開発者ツールの指定が正しくありません");
  return value;
}

/** 外部のターミナルで開くフォルダの指定か確かめる（絶対パスの、いまあるフォルダ） */
export function existingFolder(value: unknown): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("フォルダの場所が正しくありません");
  if (!fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`フォルダが見つかりません: ${value}`);
  return value;
}

/** 対応している外部のターミナルか確かめる（知らないものは Terminal.app にする） */
export function knownTerminal(id: unknown): ExternalTerminalId {
  return EXTERNAL_TERMINALS.some((t) => t.id === id) ? (id as ExternalTerminalId) : "terminal";
}

/**
 * 外部のターミナルでフォルダを開く `open` の引数。アプリごとに作業フォルダの渡し方が違う
 * （Terminal・iTerm2・Warp はフォルダを開かせる。Ghostty・WezTerm・Alacritty・kitty は新しい窓に作業フォルダを渡す）
 */
export function externalTerminalArgs(id: ExternalTerminalId, dir: string): string[] {
  switch (id) {
    case "ghostty":
      return ["-na", "Ghostty", "--args", `--working-directory=${dir}`];
    case "wezterm":
      return ["-na", "WezTerm", "--args", "start", "--cwd", dir];
    case "alacritty":
      return ["-na", "Alacritty", "--args", "--working-directory", dir];
    case "kitty":
      return ["-na", "kitty", "--args", "--directory", dir];
    case "iterm":
      return ["-a", "iTerm", dir];
    case "warp":
      return ["-a", "Warp", dir];
    default:
      return ["-a", "Terminal", dir];
  }
}

/** 一覧のうち、この Mac に入っているアプリ（/Applications か ~/Applications にあるもの。always はいつも入っているもの） */
function installedApps<T extends string>(apps: readonly { id: T; app: string }[], always: T, home: string, exists: (p: string) => boolean): T[] {
  return apps
    .filter((a) => a.id === always || [`/Applications/${a.app}.app`, path.join(home, "Applications", `${a.app}.app`)].some(exists))
    .map((a) => a.id);
}

/** この Mac に入っている外部のターミナル（Terminal.app はいつも入っている） */
export function installedTerminals(home = os.homedir(), exists: (p: string) => boolean = fs.existsSync): ExternalTerminalId[] {
  return installedApps(EXTERNAL_TERMINALS, "terminal", home, exists);
}

/** 対応している外部のブラウザか確かめる（知らないものは Chrome にする） */
export function knownBrowser(id: unknown): ExternalBrowserId {
  return EXTERNAL_BROWSERS.some((b) => b.id === id) ? (id as ExternalBrowserId) : "chrome";
}

/** 外部のブラウザで開く `open` の引数（url は http(s) のときだけ渡す。なければアプリを開くだけ） */
export function externalBrowserArgs(id: ExternalBrowserId, url?: unknown): string[] {
  const app = EXTERNAL_BROWSERS.find((b) => b.id === id)?.app ?? "Google Chrome";
  return typeof url === "string" && /^https?:\/\//.test(url) ? ["-a", app, url] : ["-a", app];
}

/** この Mac に入っている外部のブラウザ（Safari はいつも入っている） */
export function installedBrowsers(home = os.homedir(), exists: (p: string) => boolean = fs.existsSync): ExternalBrowserId[] {
  return installedApps(EXTERNAL_BROWSERS, "safari", home, exists);
}

/** Mac の通知の中身（タイトル・本文と、押したときに開くチャット） */
export interface NotifyArgs {
  title: string;
  body: string;
  /** 押したときに開くチャット（なければ Kickoff を前に出すだけ。テスト通知など） */
  run?: { projectId: number; runId: number };
}

const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

/** 画面から届いた通知の指定か確かめる（長すぎる文は切る） */
export function notifyArgs(value: unknown): NotifyArgs {
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v.title !== "string" || !v.title.trim()) throw new Error("通知のタイトルがありません");
  const body = typeof v.body === "string" ? v.body : "";
  const run = positiveInt(v.projectId) && positiveInt(v.runId) ? { projectId: v.projectId, runId: v.runId } : undefined;
  return { title: v.title.slice(0, 200), body: body.slice(0, 500), ...(run ? { run } : {}) };
}

/**
 * 通知の ID（通知センターに残った通知を、アプリを起動し直したあとに押されても、そのチャットを開けるように埋め込む）。
 * 同じ ID を使い回すと、前の通知が消えるときに新しい通知まで消えるので、毎回変える
 */
export function notificationIdOf(run: NotifyArgs["run"], now = Date.now()): string {
  return run ? `kickoff-run:${run.projectId}:${run.runId}:${now}` : `kickoff:${now}`;
}

/** 通知の ID から、押したときに開くチャットを読み取る（チャットのものでなければ undefined） */
export function runOfNotificationId(id: string): NotifyArgs["run"] {
  const m = /^kickoff-run:(\d+):(\d+):/.exec(id);
  return m ? { projectId: Number(m[1]), runId: Number(m[2]) } : undefined;
}
