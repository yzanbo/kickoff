// AI の CLI に新しい版が出ていないかを確かめる（開発のチャットと、製品版の入れ替えの最後に知らせる）。
//   Claude Code … Kickoff に同梱（Claude Agent SDK の package.json の claudeCodeVersion）。上げるのは package.json の SDK
//   Codex       … 利用者が入れた codex（Homebrew の cask か npm。最新の版は入れ方ごとに聞く。共有の決まりは src/shared/provider/cliUpdates.ts）
//   node scripts/check-agent-updates.mjs --hook  … このリポジトリの .claude/settings.json の SessionStart から呼ぶ。
//                                                  新しい版があれば、エージェントへの文脈（additionalContext）を出す（同じ版は 1 日 1 回まで）
//   node scripts/check-agent-updates.mjs         … 新しい版があれば 1 行ずつ出す（npm run install-app の最後にも呼ぶ）
// 聞くのは AI ごとに 24 時間に 1 回まで（失敗したら 1 時間あけて聞き直す）。覚えは node_modules/.cache/kickoff/<AI>-update.json。
// 手元の版が読めない・届かないときは何も言わない。どの道でも終わりのコードは 0（チャット・入れ替えを止めない）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_INSTALL_SOURCE_LABELS, CODEX_LATEST_URLS, CODEX_UPDATE_COMMANDS, codexInstallSource, codexLatestOf, compareVersions, parseCodexVersion } from "../src/shared/provider/cliUpdates.ts";

const SDK = "@anthropic-ai/claude-agent-sdk";
const CLAUDE_LATEST_URL = `https://registry.npmjs.org/${SDK}/latest`;
const FETCH_TIMEOUT_MS = 3000;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;

/** この Mac の日付（YYYY-MM-DD）。「今日もう知らせたか」を日付で見る */
export function localDay(time) {
  return new Date(time).toLocaleDateString("sv-SE");
}

/** 聞き直すか（覚えがない・24 時間たった・聞く先が変わった。ただし失敗して 1 時間たっていなければ聞かない） */
export function needsFetch(cache, now, key = null) {
  if (key !== null && cache?.key !== key) return true;
  if (cache?.failed_at && now - Date.parse(cache.failed_at) < RETRY_AFTER_FAIL_MS) return false;
  if (!cache?.checked_at || !cache.latest) return true;
  return now - Date.parse(cache.checked_at) >= CHECK_EVERY_MS;
}

/** 知らせるか。フックのときは、同じ版をその日にもう知らせていれば黙る */
export function shouldNotify({ local, latest, notified, now, hook }) {
  if (!latest || !local || compareVersions(latest, local) <= 0) return false;
  if (!hook) return true;
  return !(notified?.version === latest && notified.at && localDay(notified.at) === localDay(now));
}

/** エージェントへの文脈の文（AI ごと） */
export function hookContext(agent, local, latest, command = null, source = null) {
  if (agent === "claude") {
    return (
      `Kickoff の Claude Code に新しい版が出ています（いま ${local} → 最新 ${latest}）。` +
      "返答の最初に利用者へ短く知らせ、上げるかは利用者に任せてください（上げるときは package.json の @anthropic-ai/claude-agent-sdk を上げる）。"
    );
  }
  return (
    `Codex に新しい版が出ています（いま ${local} → 最新 ${latest}。${source}）。` +
    `返答の最初に利用者へ短く知らせ、上げるかは利用者に任せてください（上げるときは \`${command}\` を前後に何も付けずに単独で流す。` +
    "上げたら開発版で Codex のチャットを 1 回動かし、app-server とのやり取りが変わっていないか確かめる）。"
  );
}

/** SessionStart フックの出力（知らせる AI の文をつなぐ） */
export function hookOutput(contexts) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: contexts.join("\n") } });
}

/** ターミナルに出す 1 行 */
export function noticeLine(agent, local, latest, command = null) {
  if (agent === "claude") return `Claude Code ${latest} が出ています（Kickoff はいま ${local}）。上げるときは、kickoff のチャットで「Claude Code を上げて」と頼んでください`;
  return `Codex ${latest} が出ています（いま ${local}）。上げるときは、ターミナルで ${command} を流してください`;
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

/** codex の実行ファイル（PATH の順 → Homebrew → /usr/local/bin → ~/.local/bin。コアの findExecutable と同じ順） */
function findCodex() {
  const dirs = [...(process.env.PATH ?? "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local", "bin")];
  for (const dir of dirs) {
    const file = dir && path.join(dir, "codex");
    if (file && existsSync(file)) return file;
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

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": "Kickoff" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** 覚えを読み、要るときだけ聞き直して覚え直す */
async function latestWithCache(cacheFile, now, key, fetchLatest) {
  let cache = readJson(cacheFile) ?? {};
  if (needsFetch(cache, now, key)) {
    try {
      const latest = await fetchLatest();
      if (!latest) throw new Error("版が読めない");
      cache = { ...cache, key, latest, checked_at: new Date(now).toISOString(), failed_at: null };
    } catch {
      cache = { ...cache, key, failed_at: new Date(now).toISOString(), ...(cache.key === key ? {} : { latest: null }) };
    }
    writeJson(cacheFile, cache);
  }
  return cache;
}

/** 知らせる AI ごとの { agent, local, latest, command, source } と覚えの場所 */
async function claudeNotice(nodeModules, now) {
  const local = readJson(path.join(nodeModules, SDK, "package.json"))?.claudeCodeVersion;
  if (typeof local !== "string") return null;
  const cacheFile = path.join(nodeModules, ".cache", "kickoff", "claude-update.json");
  const cache = await latestWithCache(cacheFile, now, null, async () => {
    const body = await fetchJson(CLAUDE_LATEST_URL);
    return typeof body.claudeCodeVersion === "string" ? body.claudeCodeVersion : null;
  });
  return { agent: "claude", local, latest: cache.latest, cache, cacheFile };
}

async function codexNotice(nodeModules, now, codexPath) {
  if (!codexPath) return null;
  let real = codexPath;
  try {
    real = realpathSync(codexPath);
  } catch {
    // リンクを解けなければそのまま見る
  }
  const source = codexInstallSource(real);
  if (!source) return null;
  let local = null;
  try {
    local = parseCodexVersion(execFileSync(codexPath, ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
  if (!local) return null;
  const cacheFile = path.join(nodeModules, ".cache", "kickoff", "codex-update.json");
  const cache = await latestWithCache(cacheFile, now, source, async () => codexLatestOf(await fetchJson(CODEX_LATEST_URLS[source])));
  return { agent: "codex", local, latest: cache.latest, command: CODEX_UPDATE_COMMANDS[source], source: CODEX_INSTALL_SOURCE_LABELS[source], cache, cacheFile };
}

/**
 * 新しい版を確かめ、知らせる文（フックなら JSON、そうでなければ 1 行ずつつないだ文）を返す。知らせることがなければ null
 * @param {{ hook?: boolean, start?: string, now?: number, codexPath?: string | null }} [options]
 */
export async function checkAgentUpdates({ hook = false, start = path.join(import.meta.dirname, ".."), now = Date.now(), codexPath = findCodex() } = {}) {
  const nodeModules = findNodeModules(start);
  if (!nodeModules) return null;
  const found = (await Promise.all([claudeNotice(nodeModules, now).catch(() => null), codexNotice(nodeModules, now, codexPath).catch(() => null)])).filter(Boolean);
  const due = found.filter((n) => shouldNotify({ local: n.local, latest: n.latest, notified: n.cache.notified, now, hook }));
  if (due.length === 0) return null;
  if (!hook) return due.map((n) => noticeLine(n.agent, n.local, n.latest, n.command)).join("\n");
  for (const n of due) writeJson(n.cacheFile, { ...n.cache, notified: { version: n.latest, at: new Date(now).toISOString() } });
  return hookOutput(due.map((n) => hookContext(n.agent, n.local, n.latest, n.command, n.source)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hook = process.argv.includes("--hook");
  const start = hook && process.env.CLAUDE_PROJECT_DIR ? process.env.CLAUDE_PROJECT_DIR : undefined;
  try {
    const out = await checkAgentUpdates({ hook, start });
    if (out) console.log(out);
  } catch {
    // 何があってもチャットを止めない
  }
  process.exit(0);
}
