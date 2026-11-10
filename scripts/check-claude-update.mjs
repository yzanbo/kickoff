// Kickoff に入っている Claude Code（Claude Agent SDK の package.json の claudeCodeVersion）に、新しい版が出ていないかを確かめる。
//   node scripts/check-claude-update.mjs --hook  … このリポジトリの .claude/settings.json の SessionStart から呼ぶ。
//                                                  新しい版があれば、エージェントへの文脈（additionalContext）を出す（同じ版は 1 日 1 回まで）
//   node scripts/check-claude-update.mjs         … 新しい版があれば 1 行を出す（npm run install-app の最後にも呼ぶ）
// npm に聞くのは 24 時間に 1 回まで（失敗したら 1 時間あけて聞き直す）。覚えは node_modules/.cache/kickoff/claude-update.json。
// 手元の版が読めない・npm に届かないときは何も言わない。どの道でも終わりのコードは 0（チャット・入れ替えを止めない）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SDK = "@anthropic-ai/claude-agent-sdk";
const LATEST_URL = `https://registry.npmjs.org/${SDK}/latest`;
const FETCH_TIMEOUT_MS = 3000;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;

/** 版（2.1.322 など）を数字の段ごとに比べる。a が新しければ正、同じなら 0、古ければ負 */
export function compareVersions(a, b) {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** この Mac の日付（YYYY-MM-DD）。「今日もう知らせたか」を日付で見る */
export function localDay(time) {
  return new Date(time).toLocaleDateString("sv-SE");
}

/** npm に聞き直すか（覚えがない・24 時間たった。ただし失敗して 1 時間たっていなければ聞かない） */
export function needsFetch(cache, now) {
  if (cache?.failed_at && now - Date.parse(cache.failed_at) < RETRY_AFTER_FAIL_MS) return false;
  if (!cache?.checked_at || !cache.latest) return true;
  return now - Date.parse(cache.checked_at) >= CHECK_EVERY_MS;
}

/** 知らせるか。フックのときは、同じ版をその日にもう知らせていれば黙る */
export function shouldNotify({ local, latest, notified, now, hook }) {
  if (!latest || compareVersions(latest, local) <= 0) return false;
  if (!hook) return true;
  return !(notified?.version === latest && notified.at && localDay(notified.at) === localDay(now));
}

/** SessionStart フックの出力（エージェントへの文脈） */
export function hookOutput(local, latest) {
  const additionalContext =
    `Kickoff の Claude Code に新しい版が出ています（いま ${local} → 最新 ${latest}）。` +
    "返答の最初に利用者へ短く知らせ、上げるかは利用者に任せてください（上げるときは package.json の @anthropic-ai/claude-agent-sdk を上げる）。";
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } });
}

/** ターミナルに出す 1 行 */
export function noticeLine(local, latest) {
  return `Claude Code ${latest} が出ています（Kickoff はいま ${local}）。上げるときは、kickoff のチャットで「Claude Code を上げて」と頼んでください`;
}

/** SDK の node_modules を探す（上のフォルダへたどる。ワークツリーで見つからなければ、本体のフォルダを見る） */
function findNodeModules(start) {
  const has = (dir) => existsSync(path.join(dir, "node_modules", SDK, "package.json"));
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (has(dir)) return path.join(dir, "node_modules");
    if (path.dirname(dir) === dir) break;
  }
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: start, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const main = path.dirname(common);
    if (has(main)) return path.join(main, "node_modules");
  } catch {
    // Git の作業場所でなければあきらめる
  }
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  } catch {
    // 覚えを書けなくても知らせは出す
  }
}

async function fetchLatest() {
  const res = await fetch(LATEST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`npm registry: ${res.status}`);
  const body = await res.json();
  return typeof body.claudeCodeVersion === "string" ? body.claudeCodeVersion : null;
}

/**
 * 新しい版を確かめ、知らせる文（フックなら JSON、そうでなければ 1 行）を返す。知らせることがなければ null
 * @param {{ hook?: boolean, start?: string, now?: number }} [options]
 */
export async function checkClaudeUpdate({ hook = false, start = path.join(import.meta.dirname, ".."), now = Date.now() } = {}) {
  const nodeModules = findNodeModules(start);
  if (!nodeModules) return null;
  const local = readJson(path.join(nodeModules, SDK, "package.json"))?.claudeCodeVersion;
  if (typeof local !== "string") return null;

  const cacheFile = path.join(nodeModules, ".cache", "kickoff", "claude-update.json");
  let cache = readJson(cacheFile) ?? {};
  if (needsFetch(cache, now)) {
    try {
      const latest = await fetchLatest();
      if (!latest) throw new Error("claudeCodeVersion がない");
      cache = { ...cache, latest, checked_at: new Date(now).toISOString(), failed_at: null };
    } catch {
      cache = { ...cache, failed_at: new Date(now).toISOString() };
    }
    writeJson(cacheFile, cache);
  }

  if (!shouldNotify({ local, latest: cache.latest, notified: cache.notified, now, hook })) return null;
  if (!hook) return noticeLine(local, cache.latest);
  writeJson(cacheFile, { ...cache, notified: { version: cache.latest, at: new Date(now).toISOString() } });
  return hookOutput(local, cache.latest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hook = process.argv.includes("--hook");
  const start = hook && process.env.CLAUDE_PROJECT_DIR ? process.env.CLAUDE_PROJECT_DIR : undefined;
  try {
    const out = await checkClaudeUpdate({ hook, start });
    if (out) console.log(out);
  } catch {
    // 何があってもチャットを止めない
  }
  process.exit(0);
}
