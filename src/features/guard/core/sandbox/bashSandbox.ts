// AI の Bash の砂場（プロバイダー非依存）: Bash のコマンドが書ける場所を、作業場所・メモのフォルダ・決まりの例外だけにする。
// 止めるのは OS（Claude Code は macOS の Seatbelt）で、ここは「どこに書けるか・どのコマンドを砂場の外で流すか」の一覧を作るだけ（各 CLI の設定に直すのはプロバイダー）
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitOutput } from "@/foundation/core/workplace/exec";
import type { AgentSandboxRules } from "@/foundation/core/platform/types";
import { realPathLoose } from "@/foundation/core/system/paths";

/** プロバイダーに渡す砂場（パスはどれも実体のパス） */
export interface BashSandbox {
  /** 書けるフォルダ（作業場所・メモのフォルダ・決まりの例外） */
  writableDirs: string[];
  /** 読めるフォルダに足したが、書かせないもの（添付の保存先・作業場所の外の参照資料。プロバイダーが読めるフォルダを書けるようにしてしまうため） */
  readOnlyDirs: string[];
  /** 砂場の外で流すコマンド（Claude Code の許可ルールの書き方 `<コマンド>:*`。中で自分の砂場をかけるので砂場の中では動かないもの） */
  unsandboxedCommands: string[];
  /** Bash の通信を通す中継のポート（どこへでも通す。ネットワークは絞らない。なければ null = プロバイダーの中継のまま） */
  proxyPort: number | null;
}

/** 実行のたびに使うもの（startCore が作る） */
export interface BashSandboxDeps {
  /** OS ごとの決まり（一時フォルダ・キャッシュ・パッケージの置き場・砂場の外で流すコマンド） */
  rules: AgentSandboxRules;
  /** Bash の通信を通す中継のポート（networkRelay.ts。起こせなければ null） */
  proxyPort: number | null;
  /** Kickoff のゴミ箱の置き場（kickoff-trash が書く。置けなかったら null） */
  trashDir: string | null;
}

/** OS によらないキャッシュ（ホームフォルダからの場所。npm・pnpm・yarn・bun と XDG のキャッシュ） */
export const HOME_CACHE_DIRS = [".npm", ".cache", ".pnpm-store", ".yarn", ".bun"];

/**
 * 道具が自分の状態を書くフォルダ（ホームフォルダからの場所）。docker build（buildx）はビルダーの一覧・ビルドの記録を書く（入れないと砂場で止まる）。
 * 認証の情報の入る ~/.docker/config.json（docker login）は利用者の設定なので、~/.docker 全体は入れない
 */
export const HOME_STATE_DIRS = [path.join(".docker", "buildx")];

/** Electron を起動する（Electron のアプリを動かす）スクリプトの見分け方（electron . / electron-vite dev・preview / electron-forge start） */
const ELECTRON_LAUNCH = /(^|[\s;&|(])(electron(\s|$)|electron-vite\s+(dev|preview)\b|electron-forge\s+start\b)/;

/** package.json から直接 Electron を起動するコマンド（npx から） */
export const ELECTRON_DIRECT_COMMANDS = ["npx electron:*", "npx electron-vite:*"];

/**
 * Electron を起動するスクリプトの名前（Electron は起動するときにサービスの登録（bootstrap_check_in）をし、砂場の規則がそれを断る。設定で許す口がなく、--no-sandbox でも同じ）
 */
export function electronLaunchScripts(scripts: Record<string, unknown>): string[] {
  return Object.entries(scripts)
    .filter(([, command]) => typeof command === "string" && ELECTRON_LAUNCH.test(command))
    .map(([name]) => name);
}

/** スクリプトを流すコマンド（npm・pnpm・yarn・bun。決まりは「すべてがこのどれかで始まるときだけ砂場の外」なので、前に VAR=値・後ろにパイプ・リダイレクトを付けると砂場の中に戻る） */
export function scriptRunCommands(names: string[]): string[] {
  return names.flatMap((name) => [
    `npm run ${name}:*`,
    ...(name === "start" ? ["npm start:*"] : []),
    `pnpm ${name}:*`,
    `pnpm run ${name}:*`,
    `yarn ${name}:*`,
    `yarn run ${name}:*`,
    `bun run ${name}:*`,
  ]);
}

/** 作業場所の package.json が Electron を使っていれば、Electron を起動するコマンド（使っていなければ空） */
async function electronCommandsOf(workdir: string): Promise<string[]> {
  const text = await fs.readFile(path.join(workdir, "package.json"), "utf8").catch(() => null);
  if (text === null) return [];
  let pkg: { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  try {
    pkg = JSON.parse(text) as typeof pkg;
  } catch {
    return [];
  }
  if (!pkg.dependencies?.electron && !pkg.devDependencies?.electron) return [];
  return [...scriptRunCommands(electronLaunchScripts(pkg.scripts ?? {})), ...ELECTRON_DIRECT_COMMANDS];
}

/** 共有の .git（ワークツリーでコミットすると本体の .git に書く。丸ごと例外にする。Git でなければ null） */
async function gitCommonDir(workdir: string): Promise<string | null> {
  const out = await gitOutput(workdir, ["rev-parse", "--path-format=absolute", "--git-common-dir"], [], 5000).catch(() => "");
  return out.trim() || null;
}

/** 重なりを除いて、実体のパスにする（まだないものは、あるところまでを解く） */
function realDirs(dirs: (string | null)[]): string[] {
  return [...new Set(dirs.filter((d): d is string => d !== null && d !== "").map(realPathLoose))];
}

/**
 * このチャットの実行の砂場を作る。書ける = 作業場所・メモのフォルダ・決まりの例外（共有の .git・Claude Code のサブエージェントのワークツリー・ゴミ箱・
 * 一時フォルダ・キャッシュ・道具の状態（docker の buildx）・パッケージの置き場）。利用者の設定ファイル（~/.gitconfig・~/.zshrc・~/.claude.json など）は入れない
 * （Claude Code の設定のフックは砂場の外で動くので、Bash で書ければ砂場を抜けられる。Edit で書くなら書き込み先の守りが承認カードで聞く）
 */
export async function bashSandboxFor(deps: BashSandboxDeps, { workdir, memoDir, readOnlyDirs }: { workdir: string; memoDir: string | null; readOnlyDirs: string[] }): Promise<BashSandbox> {
  const home = os.homedir();
  const [commonDir, platformDirs, electronCommands] = await Promise.all([gitCommonDir(workdir), deps.rules.writableDirs(), electronCommandsOf(workdir)]);
  // Claude Code のサブエージェントのワークツリー（isolation: "worktree"。<リポジトリ>/.claude/worktrees/<名前>）。共有の .git が <リポジトリ>/.git のときだけ分かる
  const subagentWorktrees = commonDir && path.basename(commonDir) === ".git" ? path.join(path.dirname(commonDir), ".claude", "worktrees") : null;
  return {
    writableDirs: realDirs([workdir, memoDir, commonDir, subagentWorktrees, deps.trashDir, ...[...HOME_CACHE_DIRS, ...HOME_STATE_DIRS].map((d) => path.join(home, d)), ...platformDirs]),
    readOnlyDirs: realDirs(readOnlyDirs),
    unsandboxedCommands: [...new Set([...deps.rules.unsandboxedCommands, ...electronCommands])],
    proxyPort: deps.proxyPort,
  };
}
