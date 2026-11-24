// Claude Agent SDK の口を閉じる 1 ファイル（SDK の型・関数の再輸出と、型に出ていない欄を読む関数・同梱のパッケージの場所）。
// SDK（@anthropic-ai/claude-agent-sdk）を直接読むのはここだけ。版を上げたら、ここに書いた欄がまだあるかを確かめて TESTED_VERSION を直す
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Query, SDKMessage, SDKRateLimitInfo } from "@anthropic-ai/claude-agent-sdk";

export type {
  CanUseTool,
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  McpHttpServerConfig,
  Options,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKControlGetUsageResponse,
  SDKMessage,
  SDKRateLimitInfo,
  SDKResultMessage,
  SDKUserMessage,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
export { forkSession, getSubagentMessages, query } from "@anthropic-ai/claude-agent-sdk";

/**
 * 確かめた Agent SDK の版（package.json の @anthropic-ai/claude-agent-sdk。同梱の Claude Code はその claudeCodeVersion）。
 * 対応する Claude Code の版はこの 1 行で決め、それより古い版のための分かれ道は持たない
 */
export const TESTED_VERSION = "0.3.331";

/** 同梱の Claude Code の実行ファイルのパッケージ（OS と CPU ごと）の package.json */
const platformPackage = (require: NodeJS.Require) => require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);

/**
 * Agent SDK に同梱される Claude Code のネイティブバイナリを解決する。
 * パッケージ後の Electron では asar の外（app.asar.unpacked）に展開されている必要がある。
 */
export function resolveClaudeExecutable(): string | undefined {
  try {
    const pkg = platformPackage(createRequire(import.meta.url));
    const bin = path.join(path.dirname(pkg), process.platform === "win32" ? "claude.exe" : "claude");
    return bin.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  } catch {
    return undefined;
  }
}

/**
 * Agent SDK に同梱される Claude Code の版（SDK の package.json の claudeCodeVersion。読めなければ null）。上げるのは Kickoff の開発の側（package.json の SDK）。
 * SDK は package.json を exports に出していないので、同梱の実行ファイルのパッケージの隣（同じ @anthropic-ai の下）にあるものを読む
 */
export function bundledClaudeVersion(): string | null {
  try {
    const sdkPkg = path.join(path.dirname(path.dirname(platformPackage(createRequire(import.meta.url)))), "claude-agent-sdk", "package.json");
    const version = (JSON.parse(fs.readFileSync(sdkPkg, "utf8")) as { claudeCodeVersion?: unknown }).claudeCodeVersion;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/** プランの使用枠を聞く（制御の API。SDK で EXPERIMENTAL 扱い。形が変わったら usage.ts の normalizeUsage を直す） */
export const planUsageOf = (q: Query) => q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });

/** SDK が Claude Code を起動したときに呼ぶ口（型に出ていない。なくなっても知らせが届かないだけで、実行は変わらない） */
export const spawnedOption = (onProcessSpawned: (pid: number) => void) => ({ onProcessSpawned });

/** MCP のサーバーを初期化の頼みで渡す指定（型に出ていない欄） */
export const MCP_SERVERS_DELIVERY = { mcpServersDelivery: "initialize" as const };

/** init の知らせの、実際に使う推論の深さ（型に出ていない欄。設定・モデルの既定を通したあとの値。CLI が知らせるときだけ） */
export const initEffort = (msg: SDKMessage): string | null | undefined => (msg as { effort?: string | null }).effort;

/** 裏の作業の一覧の 1 件が、動きでないもの（見張りなど。型に出ていない ambient の欄）か */
export const isAmbientTask = (task: object): boolean => Boolean((task as { ambient?: boolean }).ambient);

/**
 * 実行中の使用枠の知らせ（rate_limit_event）から、いま超過分（追加の使用枠。使った分の支払い）で動いているか（版で名前が 2 通り）。
 * 知らせに書いていなければ null（前の値のままにする）
 */
export function overageInUseOf(info: SDKRateLimitInfo): boolean | null {
  return info.isUsingOverage ?? info.overageInUse ?? null;
}
