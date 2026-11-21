import fs from "node:fs/promises";
import os from "node:os";
import type { EffortDefault } from "@shared/chat/types";
import { EFFORT_LEVELS, type EffortLevel } from "@shared/settings/types";
import { CLAUDE_ENV, claudeSettingsFiles } from "./internals";

/** 設定ファイルの中身のうち、推論の深さにかかわるところ */
interface EffortSettings {
  effortLevel?: unknown;
  modelSettings?: Record<string, { effortLevel?: unknown } | undefined>;
}

const asEffort = (value: unknown): EffortLevel | undefined => (EFFORT_LEVELS.includes(value as EffortLevel) ? (value as EffortLevel) : undefined);

async function readSettings(file: string): Promise<EffortSettings | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as EffortSettings;
  } catch {
    return undefined; // ないか、読めない設定は飛ばす
  }
}

/**
 * チャットで推論の深さを指定しないとき（既定）に、Claude Code が使う深さを設定から求める（読むだけ）。
 * 環境変数 CLAUDE_CODE_EFFORT_LEVEL → 作業フォルダの .claude/settings.local.json → .claude/settings.json → ~/.claude/settings.json の順に見て、
 * それぞれ、そのモデルの設定（modelSettings.<モデルの ID>.effortLevel）、全体の設定（effortLevel）の順に探す。
 * どこにもなければ null（モデルの既定。Kickoff からは値が分からない）
 */
export async function claudeEffortDefault(model: string | null, cwd: string, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): Promise<EffortDefault> {
  const fromEnv = asEffort(env[CLAUDE_ENV.effortLevel]);
  if (fromEnv) return { effort: fromEnv, source: "env" };
  for (const { file, source } of claudeSettingsFiles(cwd, home)) {
    const settings = await readSettings(file);
    if (!settings) continue;
    const effort = (model ? asEffort(settings.modelSettings?.[model]?.effortLevel) : undefined) ?? asEffort(settings.effortLevel);
    if (effort) return { effort, source };
  }
  return { effort: null, source: null };
}
