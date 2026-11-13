// macOS の、メインプロセスの口（DesktopPlatform）
import { execFileAsync } from "../../../core/system/exec.js";
import type { DesktopPlatform } from "../types.js";
import { externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals } from "./openCommands.js";

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
    terminalShell: () => ({ file: process.env.SHELL || "/bin/zsh", args: (command) => (command ? ["-l", "-c", command] : ["-l"]) }),
    isDevElectronMain: (command) => ELECTRON_MAIN.test(command),
  };
}
