// macOS の口（HostPlatform）。OS のコマンド・パスはこのフォルダに置く（機能だけが使う macOS の値は各機能の core/macos*.ts。@/app/core/platform.ts が選ぶ）
import os from "node:os";
import path from "node:path";
import { runCommand } from "@/foundation/core/system/exec";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { listeningSockets, processCwds } from "./listening";
import { alive, appBundleOf, processTable } from "./processes";
import { startShellPath } from "./shellPath";

/** macOS のアプリの保存先の親（Electron の appData と同じ） */
export const MACOS_APP_DATA_ROOT = path.join(os.homedir(), "Library", "Application Support");

/** macOS の口を作る */
export function macosPlatform(): HostPlatform {
  return {
    appDataRoot: MACOS_APP_DATA_ROOT,
    startShellPath: (dataDir) => startShellPath({ dataDir }),
    openApp: async (name) => void (await runCommand("/usr/bin/open", ["-a", name])),
    listeningSockets,
    processTable,
    processCwds,
    kill: (pid, signal) => process.kill(pid, signal),
    alive,
    appBundleOf,
  };
}
