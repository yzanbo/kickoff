// macOS の AI の Bash の砂場の決まり
import os from "node:os";
import path from "node:path";
import { findExecutable, runCommand } from "../../system/exec.js";
import { realPathOrSelf } from "../../system/paths.js";
import type { AgentSandboxRules } from "../types.js";

/**
 * 砂場の外で流すコマンド: Homebrew は入れる・上げるときに自分で sandbox-exec をかけるが、macOS は砂場の入れ子を許さず（sandbox_apply: Operation not permitted）、
 * Homebrew は既定の置き場では自分の砂場を切らない（HOMEBREW_AVOID_NESTED_SANDBOXING は既定の置き場では断る）。消す・更新するは砂場の中で動く
 */
const MACOS_UNSANDBOXED_COMMANDS = ["brew install:*", "brew upgrade:*", "brew reinstall:*"];

/** コマンドの 1 行目（失敗・なければ null） */
async function firstLine(names: string[], args: string[]): Promise<string | null> {
  const file = findExecutable(names);
  if (!file) return null;
  const out = await runCommand(file, args, { timeout: 5000 }).catch(() => "");
  return out.trim().split("\n")[0]?.trim() || null;
}

/** macOS の砂場の決まりを作る（パッケージの置き場は初めて使うときに 1 回だけ調べる） */
export function macosAgentSandbox(): AgentSandboxRules {
  let packagePlaces: Promise<string[]> | null = null;
  const home = os.homedir();
  // 一時フォルダ（/tmp は /private/tmp へのリンク。TMPDIR は /private/var/folders の下）
  const tempDirs = ["/private/tmp", realPathOrSelf(os.tmpdir())];
  return {
    tempDirs,
    writableDirs: async () => {
      // パッケージの置き場（O1: brew・npm i -g を AI に頼めるように）。Homebrew の置き場と、npm の全体の置き場（nvm などでは別の場所）
      packagePlaces ??= Promise.all([firstLine(["brew"], ["--prefix"]), firstLine(["npm"], ["prefix", "-g"])]).then((dirs) => dirs.filter((d): d is string => d !== null));
      return [
        ...tempDirs,
        // キャッシュ（pnpm の macOS の置き場も）・Homebrew の記録
        path.join(home, "Library", "Caches"),
        path.join(home, "Library", "pnpm"),
        path.join(home, "Library", "Logs", "Homebrew"),
        ...(await packagePlaces),
      ];
    },
    unsandboxedCommands: MACOS_UNSANDBOXED_COMMANDS,
  };
}
