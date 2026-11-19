// macOS の口（HostPlatform）。OS のコマンド・パスはこのフォルダに置く
import os from "node:os";
import path from "node:path";
import { runCommand } from "@/foundation/core/system/exec";
import { checkMacosSpeech, transcribeMacos } from "@/features/voice/core/macos";
import type { HostPlatform, SelfGuardRules } from "@/foundation/core/platform/types";
import { macosDockerEngine } from "@/features/docker/core/macosEngine";
import { macosTailscaleCli } from "@/features/devices/core/macosTailscale";
import { listeningSockets, processCwds } from "./listening";
import { alive, appBundleOf, processTable } from "./processes";
import { loadLoginShellPath } from "./shellEnv";
import { startShellPath } from "./shellPath";
import { macosAgentSandbox } from "@/features/guard/core/macosSandbox";
import { macosSandboxDiagnostics } from "@/features/guard/core/macosSandboxDiagnostics";

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
    sandboxDiagnostics: macosSandboxDiagnostics,
    appDataRoot: MACOS_APP_DATA_ROOT,
    loadLoginShellPath,
    startShellPath: (dataDir) => startShellPath({ dataDir }),
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
    tailscaleCli: macosTailscaleCli,
    agentSandbox: macosAgentSandbox(),
    // ログインシェル（$SHELL。なければ zsh）。決まったコマンドのタブは -l -c でそれだけを流す
    terminalShell: () => ({ file: process.env.SHELL || "/bin/zsh", args: (command) => (command ? ["-l", "-c", command] : ["-l"]) }),
  };
}
