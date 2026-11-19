// macOS の、メインプロセスの口（DesktopPlatform）
import { execFileAsync } from "@/foundation/core/system/exec";
import type { DesktopPlatform } from "@/foundation/desktop/platform/types";
import { externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals } from "./openCommands";

/** Electron の開発用の実行ファイル（npm run dev で動く Kickoff Dev など。Helper のプロセスは含まない） */
const ELECTRON_MAIN = /\/Electron\.app\/Contents\/MacOS\/Electron(\s|$)/;

/** macOS の、メインプロセスの口を作る */
export function macosDesktopPlatform(): DesktopPlatform {
  return {
    installedTerminals: () => installedTerminals(),
    openTerminal: async (id, dir) => void (await execFileAsync("/usr/bin/open", externalTerminalArgs(id, dir))),
    installedBrowsers: () => installedBrowsers(),
    openBrowser: async (id, url) => void (await execFileAsync("/usr/bin/open", externalBrowserArgs(id, url))),
    // ログインシェルで動かす（PATH などはふだんのシェルと同じ）
    isDevElectronMain: (command) => ELECTRON_MAIN.test(command),
  };
}
