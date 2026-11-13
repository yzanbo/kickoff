// macOS の口（HostPlatform）。OS のコマンド・パスはこのフォルダに置く
import { runCommand } from "../../system/exec.js";
import { checkMacosSpeech, transcribeMacos } from "../../voice/macos.js";
import type { HostPlatform } from "../types.js";
import { listeningSockets, processCwds } from "./listening.js";
import { alive, appBundleOf, processTable } from "./processes.js";
import { loadLoginShellPath } from "./shellEnv.js";
import { moveToTrash } from "./trash.js";

interface MacosPlatformOptions {
  /** macOS の音声認識の補助コマンド（kickoff-speech）の場所（なければ音声認識は使えない扱い） */
  speechHelper?: string | null;
}

/** macOS の口を作る */
export function macosPlatform({ speechHelper = null }: MacosPlatformOptions = {}): HostPlatform {
  return {
    loadLoginShellPath,
    moveToTrash,
    openApp: async (name) => void (await runCommand("/usr/bin/open", ["-a", name])),
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
  };
}
