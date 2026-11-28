// 製品版の署名（npm run install-app・npm run publish が electron-builder の afterPack から使う。scripts/after-pack.mjs）。
// electron-builder は信頼の設定のない自前の印鑑を選べず、黙って仮の署名（ad-hoc）で成功してしまうので、組み立ては印鑑なし（mac.identity: null）にし、
// ここで自分で codesign を流す。作ったあとに「同じアプリと見なす条件」の印鑑の指紋を確かめ、違えば失敗にする（黙って仮の署名で配らないため）
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import path from "node:path";

/**
 * 署名の仕方（環境変数 KICKOFF_SIGN）: release = 金庫の印鑑（scripts/vault.mjs）/ adhoc = 仮の署名。
 * 付けなければ adhoc（npm run dist などで手元に作るとき。配る版と手元ビルドは呼ぶ側が必ず release を付ける）
 */
export function signModeOf(value) {
  if (value === undefined || value === "" || value === "adhoc") return "adhoc";
  if (value === "release") return "release";
  throw new Error(`KICKOFF_SIGN は release か adhoc です（${value}）`);
}

/** ADHOC=1 で印鑑なしの製品版を作るか（1 だけを受け付ける。ADHOC=true などの書き違いで、気づかずに印鑑なしにしないため） */
export function adhocRequested(value) {
  if (value === undefined || value === "") return false;
  if (value === "1") return true;
  throw new Error(`ADHOC は 1 だけを受け付けます（${value}）。印鑑なしで作るときは ADHOC=1 を付けてください`);
}

/** codesign -d -r- の出力から、印鑑（証明書）の SHA-1 を取り出す（仮の署名・読めなければ null） */
export function leafCertOf(requirement) {
  return /certificate leaf = H"([0-9a-fA-F]{40})"/.exec(requirement)?.[1]?.toUpperCase() ?? null;
}

/** codesign -dvvv の出力の flags に runtime（Hardened Runtime）があるか */
export function hasHardenedRuntime(details) {
  return /^CodeDirectory .*flags=0x[0-9a-f]+\([^)]*\bruntime\b[^)]*\)/m.test(details);
}

/** 期待した印鑑で署名されているか（違えば理由の文。合っていれば null） */
export function signatureProblem({ requirement, details, identity }) {
  if (!hasHardenedRuntime(details)) return "Hardened Runtime がオンになっていません";
  if (identity === null) return null;
  const leaf = leafCertOf(requirement);
  if (leaf === null) return `印鑑で署名されていません（期待した印鑑の SHA-1: ${identity}）`;
  if (leaf !== identity.toUpperCase()) return `別の印鑑で署名されています（${leaf}。期待した印鑑の SHA-1: ${identity}）`;
  return null;
}

/** Mach-O（実行ファイル・.node・dylib）の頭の 4 バイト（64 ビット・32 ビット・両方入り。向きの違いも） */
const MACHO_MAGICS = new Set([0xfeedfacf, 0xcffaedfe, 0xfeedface, 0xcefaedfe, 0xcafebabe, 0xbebafeca]);

/** バイト列が Mach-O の頭か */
export function isMachOHeader(bytes) {
  return bytes.length >= 4 && MACHO_MAGICS.has(bytes.readUInt32BE(0));
}

function isMachOFile(file) {
  const fd = openSync(file, "r");
  try {
    const head = Buffer.alloc(4);
    return readSync(fd, head, 0, 4, 0) === 4 && isMachOHeader(head);
  } finally {
    closeSync(fd);
  }
}

/** フォルダの中の Mach-O（シンボリックリンクは除く）。深いものから並べる（中から外へ署名するため） */
export function machOFilesIn(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && !lstatSync(full).isSymbolicLink() && isMachOFile(full)) found.push(full);
    }
  };
  walk(dir);
  return found.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length || a.localeCompare(b));
}

/** codesign の引数（identity が "-" なら仮の署名。keychain は検索リストに入れていない金庫を直に渡す） */
function codesignArgs({ identity, keychain, entitlements }) {
  return ["--force", "--options", "runtime", "--entitlements", entitlements, ...(keychain ? ["--keychain", keychain] : []), "-s", identity];
}

/**
 * アプリに署名する: 同梱の実行ファイル（Resources の中の claude・Copilot・node-pty・音声の補助・.node）を 1 つずつ → アプリ全体を --deep で。
 * --deep は Resources の中の実行ファイルを中身の一部として扱い押し直さないので、先に同じ印鑑・権限で押す
 */
export function signApp(appPath, options) {
  const args = codesignArgs(options);
  for (const file of machOFilesIn(path.join(appPath, "Contents", "Resources"))) {
    execFileSync("codesign", [...args, file], { stdio: ["ignore", "ignore", "inherit"] });
  }
  execFileSync("codesign", ["--deep", ...args, appPath], { stdio: ["ignore", "ignore", "inherit"] });
}

/** 署名を確かめる（入れ子も・厳しく。identity を渡せば印鑑の指紋も）。違えば投げる */
export function verifySignature(appPath, identity) {
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: ["ignore", "ignore", "inherit"] });
  // codesign -d は成功しても中身を標準エラーに書く（-r- の条件は標準出力）
  const requirement = spawnSync("codesign", ["-d", "-r-", appPath], { encoding: "utf8" });
  const details = spawnSync("codesign", ["-dvvv", appPath], { encoding: "utf8" });
  const problem = signatureProblem({ requirement: `${requirement.stdout}\n${requirement.stderr}`, details: details.stderr ?? "", identity });
  if (problem) throw new Error(`${appPath} の署名が違います: ${problem}`);
}
