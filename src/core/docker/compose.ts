// compose のファイルを名前で見つけ（中身は読まない）、設定は compose 自身に聞く（config --format json と config --hash）。
// 聞いた結果は、-f に渡すファイルと同じフォルダの .env の更新日時を鍵に覚え、変わったときだけ聞き直す（仕様書の 10 章「compose の中身を取り直すとき」）
import fs from "node:fs";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { CommandError } from "../system/exec.js";
import type { DockerCli } from "./cli.js";
import { STANDARD_COMPOSE_NAMES, composeFilesFromEnv, isAltComposeName, overrideNamesFor, parseComposeConfig, parseConfigHashes, type ComposeConfig } from "./parse.js";

/** 2 段下まで探すときに見ないフォルダ */
const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build"]);

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const listDir = (dir: string): fs.Dirent[] => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

/**
 * 作業場所の compose のファイル（絶対パス）: 直下の決まった名前と別名（compose.e2e.yaml など。override は除く）、
 * 2 段下までのフォルダの決まった名前（node_modules・.git・vendor・dist・build・「.」で始まるフォルダは見ない）
 */
export function findComposeFiles(root: string): string[] {
  const found: string[] = [];
  for (const e of listDir(root)) if (e.isFile() && ((STANDARD_COMPOSE_NAMES as readonly string[]).includes(e.name) || isAltComposeName(e.name))) found.push(path.join(root, e.name));
  const walk = (dir: string, depth: number) => {
    for (const e of listDir(dir)) {
      if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      for (const name of STANDARD_COMPOSE_NAMES) if (isFile(path.join(sub, name))) found.push(path.join(sub, name));
      if (depth < 2) walk(sub, depth + 1);
    }
  };
  walk(root, 1);
  return found.sort();
}

/**
 * まだ作っていない compose を起動するときに -f で渡すファイル: フォルダの .env の COMPOSE_FILE に見つけたファイルがあればその並び（override は足さない）、
 * なければ見つけたファイルと、決まった名前なら同じ系統の override（-f を付けると compose は override を自動で読まないため）
 */
export function upFilesFor(file: string): string[] {
  const dir = path.dirname(file);
  try {
    const fromEnv = composeFilesFromEnv(fs.readFileSync(path.join(dir, ".env"), "utf8"), file);
    if (fromEnv) return fromEnv;
  } catch {
    // .env がない
  }
  const override = overrideNamesFor(file)
    .map((n) => path.join(dir, n))
    .find(isFile);
  return override ? [file, override] : [file];
}

/** 読んだ設定（読めなければ error） */
export interface ComposeRead {
  config: ComposeConfig | null;
  error: string | null;
  hashes: Map<string, string> | null;
  /** config --format json をそのまま読んだもの（DB で開くときの案を、DB クライアントの取り込みと同じ読み方で作る） */
  doc: unknown;
}

const mtimeOf = (p: string) => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return -1;
  }
};

/** compose の設定を聞いて覚える（鍵は -f のファイルとそのフォルダの .env の更新日時。［↻］で clear） */
export class ComposeConfigCache {
  private readonly memo = new Map<string, { stamp: string; read: Promise<ComposeRead> }>();

  constructor(private readonly cli: DockerCli) {}

  /** すべて捨てる（［↻］。include・extends・env_file の先を書き換えたときのため） */
  clear() {
    this.memo.clear();
  }

  /** files（-f に渡す並び）の設定と、指紋（withHash のときだけ） */
  read(files: string[], withHash: boolean): Promise<ComposeRead> {
    const dirs = [...new Set(files.map((f) => path.dirname(f)))];
    const stamp = [...files.map(mtimeOf), ...dirs.map((d) => mtimeOf(path.join(d, ".env")))].join(",") + (withHash ? "#h" : "");
    const key = files.join("\n") + (withHash ? "#h" : "");
    const hit = this.memo.get(key);
    if (hit && hit.stamp === stamp) return hit.read;
    const read = this.load(files, withHash);
    this.memo.set(key, { stamp, read });
    return read;
  }

  private async load(files: string[], withHash: boolean): Promise<ComposeRead> {
    const fArgs = files.flatMap((f) => ["-f", f]);
    const cwd = path.dirname(files[0]);
    try {
      const out = await this.cli.run(["compose", ...fArgs, "--profile", "*", "config", "--format", "json"], { cwd, timeout: 20_000 });
      const config = parseComposeConfig(out);
      if (!config) return { config: null, error: "compose の設定を読めませんでした", hashes: null, doc: null };
      let hashes: Map<string, string> | null = null;
      if (withHash) {
        hashes = await this.cli
          .run(["compose", ...fArgs, "--profile", "*", "config", "--hash", "*"], { cwd, timeout: 20_000 })
          .then(parseConfigHashes)
          .catch(() => null);
      }
      return { config, error: null, hashes, doc: JSON.parse(out) as unknown };
    } catch (e) {
      const message = e instanceof CommandError ? e.stderr || e.message : errorMessage(e);
      return { config: null, error: message.split("\n").slice(-6).join("\n").trim(), hashes: null, doc: null };
    }
  }
}
