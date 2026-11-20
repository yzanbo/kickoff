// 店の束（Store）の使い方の表（分冊 03 の 2.7.4）。Store を丸ごと受けるファイルごとに、store.<店>.<メソッド> の回数と、店の持ち主の機能・向きを出す。
// 各単位の頭で流して「触る所」を決める（P3-4l で Store の束を消したら、このファイルも消す）。
//   node scripts/refactor/store-uses.mjs            ファイル・店・メソッド・回数・持ち主・向き（TSV。テストは除く）
//   node scripts/refactor/store-uses.mjs --summary  読む側の機能ごとの、Store を丸ごと受けるファイルの数と、向きごとの使う回数
//   node scripts/refactor/store-uses.mjs --tests    テストも数える
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURES } from "../structure.config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STORE_FILE = "src/foundation/core/db/store.ts";
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

/** 店の名前 → 持ち主（store.ts の `this.<店> = createX(…)` と、その createX を読む import のパス。土台の店は "土台"） */
function ownersOfStores() {
  const src = read(STORE_FILE);
  const featureOfImport = new Map();
  for (const m of src.matchAll(/import \{([^}]+)\} from "@\/features\/([^/]+)\//g)) {
    for (const name of m[1].split(",").map((s) => s.trim().replace(/^type /, ""))) featureOfImport.set(name, m[2]);
  }
  const owners = new Map([["db", "土台"], ["databaseId", "土台"], ["settings", "土台"], ["secrets", "土台"]]);
  for (const m of src.matchAll(/this\.(\w+) = (\w+)\(/g)) owners.set(m[1], featureOfImport.get(m[2]) ?? "土台");
  owners.set("logRevisions", "chat");
  return owners;
}

/** ファイルの持ち主（機能の名前・app・土台・scripts） */
function ownerOfFile(file) {
  const m = file.match(/^src\/(?:features|shared)\/([^/]+)\//);
  if (m && FEATURES.includes(m[1])) return m[1];
  if (file.startsWith("src/app/")) return "app";
  if (file.startsWith("src/foundation/") || file.startsWith("src/shared/")) return "土台";
  return "scripts";
}

/** 読む側から見た店の持ち主の向き（自分 / 下 / 上 / 土台） */
function direction(reader, owner) {
  if (owner === "土台") return "土台";
  if (reader === owner) return "自分";
  if (!FEATURES.includes(reader)) return "下";
  return FEATURES.indexOf(owner) < FEATURES.indexOf(reader) ? "下" : "上";
}

const withTests = process.argv.includes("--tests");
const files = execFileSync("git", ["ls-files", "src/*.ts", "src/*.tsx"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && f !== STORE_FILE && (withTests || !/\.test\.tsx?$/.test(f)));
const owners = ownersOfStores();
const rows = [];
const receivers = new Map();
for (const file of files) {
  const src = read(file);
  if (!/import (type )?\{[^}]*\bStore\b[^}]*\} from "@\/foundation\/core\/db\/store"/.test(src)) continue;
  const reader = ownerOfFile(file);
  receivers.set(reader, (receivers.get(reader) ?? 0) + 1);
  const counts = new Map();
  for (const m of src.matchAll(/\bstore\.(\w+)(?:\.(\w+))?/g)) {
    const key = `${m[1]}\t${m[2] ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) {
    const [name, method] = key.split("\t");
    const owner = owners.get(name) ?? "?";
    rows.push({ file, reader, name, method, n, owner, dir: direction(reader, owner) });
  }
}

if (process.argv.includes("--summary")) {
  const byReader = new Map();
  for (const r of rows) {
    const s = byReader.get(r.reader) ?? { 自分: 0, 下: 0, 上: 0, 土台: 0 };
    s[r.dir] += r.n;
    byReader.set(r.reader, s);
  }
  console.log("読む側\tStore を受けるファイル\t自分\t下\t上\t土台");
  for (const [reader, n] of [...receivers].sort((a, b) => b[1] - a[1])) {
    const s = byReader.get(reader) ?? { 自分: 0, 下: 0, 上: 0, 土台: 0 };
    console.log([reader, n, s.自分, s.下, s.上, s.土台].join("\t"));
  }
} else {
  console.log("ファイル\t店\tメソッド\t回数\t持ち主\t向き");
  for (const r of rows.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))) {
    console.log([r.file, r.name, r.method, r.n, r.owner, r.dir].join("\t"));
  }
}
