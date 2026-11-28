// ビルドのときに版の情報（ビルド番号 = コミットの数・短い SHA・作り方）を作る。electron.vite.config.ts がメインのコードに埋め込む。
// 作り方は環境変数 KICKOFF_BUILD_KIND（npm run publish が release、npm run install-app が local / adhoc を付ける）。付けなければ dev
import { execFileSync } from "node:child_process";

/** 埋め込める作り方（src/shared/updates/types.ts の BUILD_KINDS と同じ。build-stamp.test.mjs が突き合わせる） */
export const KINDS = ["release", "local", "adhoc", "dev"];

/** 環境変数の作り方を読む。知らない値は止める（配る版に別の印を付けたまま作らないため） */
export function buildKindOf(value) {
  if (value === undefined || value === "") return "dev";
  if (!KINDS.includes(value)) throw new Error(`KICKOFF_BUILD_KIND は ${KINDS.join("・")} のどれかです（${value}）`);
  return value;
}

/** rev-list --count の出力からビルド番号を読む（数でなければ null） */
export function parseBuildNumber(output) {
  const n = Number(output.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** リポジトリのコマンドを流す（リポジトリの外・コマンドがなければ null） */
function repo(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** いまのコミットの版の情報 */
export function readBuildStamp(cwd = process.cwd(), env = process.env) {
  const count = repo(cwd, ["rev-list", "--count", "HEAD"]);
  return {
    buildNumber: count === null ? null : parseBuildNumber(count),
    commit: repo(cwd, ["rev-parse", "--short=7", "HEAD"]) || null,
    kind: buildKindOf(env.KICKOFF_BUILD_KIND),
  };
}
