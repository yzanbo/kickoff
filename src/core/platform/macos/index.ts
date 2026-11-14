// macOS の口（HostPlatform）。OS のコマンド・パスはこのフォルダに置く
import os from "node:os";
import path from "node:path";
import { runCommand } from "../../system/exec.js";
import { checkMacosSpeech, transcribeMacos } from "../../voice/macos.js";
import type { HostPlatform, SelfGuardRules } from "../types.js";
import { macosDockerEngine } from "./docker.js";
import { listeningSockets, processCwds } from "./listening.js";
import { alive, appBundleOf, processTable } from "./processes.js";
import { loadLoginShellPath } from "./shellEnv.js";
import { moveToTrash } from "./trash.js";

interface MacosPlatformOptions {
  /** macOS の音声認識の補助コマンド（kickoff-speech）の場所（なければ音声認識は使えない扱い） */
  speechHelper?: string | null;
}

/** macOS の、自分を止める・操作するコマンドの見分け方 */
export const MACOS_SELF_GUARD: SelfGuardRules = { killByName: /\b(pkill|killall)\b/, scripting: { pattern: /\bosascript\b/, label: "AppleScript" } };

/** macOS のアプリの保存先の親（Electron の appData と同じ） */
export const MACOS_APP_DATA_ROOT = path.join(os.homedir(), "Library", "Application Support");

/** macOS の口を作る */
export function macosPlatform({ speechHelper = null }: MacosPlatformOptions = {}): HostPlatform {
  const openApp = async (name: string) => void (await runCommand("/usr/bin/open", ["-a", name]));
  return {
    appDataRoot: MACOS_APP_DATA_ROOT,
    loadLoginShellPath,
    moveToTrash,
    openApp,
    listeningSockets,
    processTable,
    processCwds,
    kill: (pid, signal) => process.kill(pid, signal),
    alive,
    appBundleOf,
    speech: {
      check: (language) => checkMacosSpeech(speechHelper, language),
      transcribe: (audio, language) => transcribeMacos(audio, { helper: speechHelper ?? "", language }),
    },
    selfGuard: MACOS_SELF_GUARD,
    dockerEngine: macosDockerEngine(openApp),
  };
}
