// アプリの外で開く口（window.kickoff.externalApps を触るのはここだけ。Mac のアプリでなければ開かない）
import type { ExternalBrowserId, ExternalTerminalId } from "@shared/foundation/ipc";

/** 外で開く先 */
export type ExternalTarget =
  /** 既定のアプリ（フォルダは Finder） */
  | { kind: "path"; path: string }
  /** Finder で表示（入っているフォルダを開いて選ぶ） */
  | { kind: "reveal"; path: string }
  /** VS Code（line があればその行へ） */
  | { kind: "vscode"; path: string; line?: number }
  /** 外部のターミナルでフォルダを開く（app を省くと Terminal.app） */
  | { kind: "terminal"; dir: string; app?: ExternalTerminalId }
  /** 外部のブラウザでページを開く（url がなければ空の新しいタブ。app を省くと Chrome） */
  | { kind: "browser"; url?: string; app?: ExternalBrowserId };

/** 外で開けるか（Mac のアプリのときだけ。ブラウザで開いた画面では開けない） */
export const canOpenExternal = (): boolean => Boolean(window.kickoff);

/** 外で開く。Mac のアプリでなければ開かずに false（開けなかったときの失敗はそのまま投げる） */
export async function openExternal(target: ExternalTarget): Promise<boolean> {
  const apps = window.kickoff?.externalApps;
  if (!apps) return false;
  if (target.kind === "path") await apps.openPath(target.path);
  else if (target.kind === "reveal") await apps.revealPath(target.path);
  else if (target.kind === "vscode") await apps.openInVSCode(target.path, target.line);
  else if (target.kind === "terminal") await apps.openTerminal(target.dir, target.app);
  else await apps.openBrowser(target.url, target.app);
  return true;
}

/** この Mac に入っている外部のターミナル（Mac のアプリでなければ undefined） */
export const installedTerminals = (): Promise<ExternalTerminalId[]> | undefined => window.kickoff?.externalApps.terminals();

/** この Mac に入っている外部のブラウザ（Mac のアプリでなければ undefined） */
export const installedBrowsers = (): Promise<ExternalBrowserId[]> | undefined => window.kickoff?.externalApps.browsers();

/**
 * 既定のブラウザで http(s) のページを開く（確かめは出さない。アプリが作った GitHub などの URL 用。本文のリンクは linkOpen.ts の openWebLink）。
 * Mac のアプリではメインの IPC（openWebUrl。メインが URL を読み直し、http(s) でなければ断る）で開く。新しいウィンドウの要求ではメインは何も開かない。
 * Mac のアプリでなければ（ブラウザで開いた画面）、ブラウザの新しいタブ
 */
export function openInDefaultBrowser(url: string): void {
  const apps = window.kickoff?.externalApps;
  // 開けないのは http(s) でない URL だけ（呼び手はアプリが作った URL なので知らせない）
  if (apps) void apps.openWebUrl(url).catch(() => {});
  else window.open(url, "_blank", "noopener,noreferrer");
}
