// ターミナルの画面（WebView の中の xterm.js）に埋め込む JS と CSS を、node_modules から TypeScript の文字列にして書き出す。
// WebView はアプリの中のファイルを読めない（読み込みは文字列の HTML だけ）ので、ビルドの前（npm install のあと）に作る。作ったファイルはリポジトリに入れない
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, "node_modules", p), "utf8");
const out = path.join(root, "src/terminal/xtermAssets.generated.ts");
const body = [
  "// scripts/xterm-assets.mjs が作る（手で直さない）",
  `export const XTERM_JS = ${JSON.stringify(read("@xterm/xterm/lib/xterm.js"))};`,
  `export const XTERM_CSS = ${JSON.stringify(read("@xterm/xterm/css/xterm.css"))};`,
  `export const FIT_JS = ${JSON.stringify(read("@xterm/addon-fit/lib/addon-fit.js"))};`,
  "",
].join("\n");
fs.writeFileSync(out, body);
console.log(`xterm の素材を書き出しました: ${path.relative(root, out)}`);
