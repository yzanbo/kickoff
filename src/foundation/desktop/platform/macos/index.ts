// macOS の、メインプロセスの口（DesktopPlatform）
import { pathToFileURL } from "node:url";
import { clipboard, ClipboardItem } from "electron";
import { execFileAsync } from "@/foundation/core/system/exec";
import type { DesktopPlatform } from "@/foundation/desktop/platform/types";
import { externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals } from "./openCommands";

/** Electron の開発用の実行ファイル（npm run dev で動く Kickoff Dev など。Helper のプロセスは含まない） */
const ELECTRON_MAIN = /\/Electron\.app\/Contents\/MacOS\/Electron(\s|$)/;

/** クリップボードの OS の形（public.file-url）を Electron の ClipboardItem で書くときの名前 */
const MAC_FILE_URL = 'electron application/osclipboard;format="public.file-url"';

/** macOS の、メインプロセスの口を作る */
export function macosDesktopPlatform(): DesktopPlatform {
  return {
    installedTerminals: () => installedTerminals(),
    openTerminal: async (id, dir) => void (await execFileAsync("/usr/bin/open", externalTerminalArgs(id, dir))),
    installedBrowsers: () => installedBrowsers(),
    openBrowser: async (id, url) => void (await execFileAsync("/usr/bin/open", externalBrowserArgs(id, url))),
    // Finder のコピーと同じ public.file-url（ファイルの URL）を、OS の形の名前を指定する書き方で書く。
    // macOS が古い形（NSFilenamesPboardType など）にも写すので、Finder・ほかのアプリ・入力欄のどれにもファイルとして貼れる
    copyFileToClipboard: (file) => clipboard.write([new ClipboardItem({ [MAC_FILE_URL]: new Blob([pathToFileURL(file).href]) })]),
    // ログインシェルで動かす（PATH などはふだんのシェルと同じ）
    isDevElectronMain: (command) => ELECTRON_MAIN.test(command),
  };
}
