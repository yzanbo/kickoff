import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS, type ExternalBrowserId, type ExternalTerminalId } from "@shared/ipc";
import { isWebUrl } from "./urls.js";

// アプリの外で開くときの命令（macOS の open の引数・VS Code の URL）と、この Mac に入っているアプリ。
// Electron に依らないので、テストできる（実行は app/externalApps.ts）

/** 外部のターミナルで開くフォルダか確かめる（いまあるフォルダ。ワークツリーが消されたなどでなければ） */
export function existingFolder(dir: string): string {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`フォルダが見つかりません: ${dir}`);
  return dir;
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

/** 外部のブラウザで開く `open` の引数（url は http(s) のときだけ渡す。なければアプリを開くだけ） */
export function externalBrowserArgs(id: ExternalBrowserId, url?: string): string[] {
  const app = EXTERNAL_BROWSERS.find((b) => b.id === id)?.app ?? "Google Chrome";
  return isWebUrl(url) ? ["-a", app, url] : ["-a", app];
}

/**
 * VS Code でファイル（line があればその行）を開く URL（vscode://file/<パス>:<行>）。パスは区切り（/）ごとに符号化する
 * （encodeURI は # と ? を符号化しないので、それを含むパスが URL の断片・問い合わせとして読まれ、開けなかった）
 */
export function vscodeFileUrl(target: string, line?: number): string {
  const position = typeof line === "number" && line > 0 ? `:${Math.floor(line)}` : "";
  return `vscode://file${target.split("/").map(encodeURIComponent).join("/")}${position}`;
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

/** この Mac に入っている外部のブラウザ（Safari はいつも入っている） */
export function installedBrowsers(home = os.homedir(), exists: (p: string) => boolean = fs.existsSync): ExternalBrowserId[] {
  return installedApps(EXTERNAL_BROWSERS, "safari", home, exists);
}
