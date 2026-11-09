import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { findExecutable } from "../../system/exec.js";

/**
 * Gemini CLI が Google ログインの更新に使う ID と秘密の値（インストールした Gemini CLI の中に書いてある）。
 * 期限の切れたログインを、手元だけで更新するのに使う（gemini.ts の accessToken）
 */
export interface OAuthClient {
  id: string;
  secret: string;
}

/** Gemini CLI の npm のパッケージ名（入れた場所の根を、この名前の package.json で見分ける） */
const PACKAGE_NAME = "@google/gemini-cli";
/** 中身を読むファイルの大きさの上限（束ねた 1 ファイルが数十 MB になる） */
const MAX_SCRIPT_BYTES = 30_000_000;
/** たどるフォルダの深さの上限（node_modules の奥まで潜らない） */
const MAX_DEPTH = 6;

/** スクリプトの中身から、ID と秘密の値の組を取り出す。両方そろわなければ null */
export function oauthClientIn(text: string): OAuthClient | null {
  const id = text.match(/\b\d+-[a-z0-9]+\.apps\.googleusercontent\.com\b/)?.[0];
  const secret = text.match(/\bGOCSPX-[\w-]+/)?.[0];
  return id && secret ? { id, secret } : null;
}

/** ファイルから上へたどり、名前が Gemini CLI の package.json があるフォルダ（パッケージの根）を返す */
export async function geminiPackageRoot(file: string): Promise<string | null> {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const name = await readFile(path.join(dir, "package.json"), "utf8").then(
      (text) => (JSON.parse(text) as { name?: unknown }).name,
      () => undefined,
    );
    if (name === PACKAGE_NAME) return dir;
  }
  return null;
}

/**
 * フォルダの中の .js を、名前に oauth を含むものから順に並べる（ログインの処理は、ふつう oauth2.js にある。
 * 束ねた版では名前が変わるので、ほかの .js も後ろに並べる）。node_modules は @google の下だけをたどる
 */
export async function scriptsIn(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const inModules = path.basename(dir) === "node_modules";
        if (inModules ? entry.name === "@google" : entry.name !== "node_modules" || depth === 0) await walk(full, depth + 1);
      } else if (entry.name.endsWith(".js")) {
        found.push(full);
      }
    }
  };
  await walk(root, 0);
  const rank = (file: string) => (/oauth/i.test(path.basename(file)) ? 0 : 1);
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** パッケージの中（と、隣に入った @google/gemini-cli-core）から、ID と秘密の値を探す */
async function searchPackage(root: string): Promise<OAuthClient | null> {
  const roots = [root, path.join(path.dirname(root), "gemini-cli-core")];
  for (const dir of roots) {
    for (const file of await scriptsIn(dir)) {
      const size = await stat(file).then((s) => s.size, () => Infinity);
      if (size > MAX_SCRIPT_BYTES) continue;
      const client = oauthClientIn(await readFile(file, "utf8").catch(() => ""));
      if (client) return client;
    }
  }
  return null;
}

/** 見つけた結果（gemini の実体のパスと更新日時ごと。Gemini CLI を入れ直したら探し直す） */
const cache = new Map<string, OAuthClient | null>();

/** インストールされている Gemini CLI の ID と秘密の値。環境変数があればそちら。見つからなければ null */
export async function geminiOAuthClient(): Promise<OAuthClient | null> {
  const { GEMINI_OAUTH_CLIENT_ID: id, GEMINI_OAUTH_CLIENT_SECRET: secret } = process.env;
  if (id && secret) return { id, secret };
  const bin = findExecutable(["gemini"]);
  if (!bin) return null;
  const real = await realpath(bin);
  const key = `${real}@${(await stat(real)).mtimeMs}`;
  if (!cache.has(key)) {
    const root = await geminiPackageRoot(real);
    cache.set(key, root ? await searchPackage(root) : null);
  }
  return cache.get(key) ?? null;
}
