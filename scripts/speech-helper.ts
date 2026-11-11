// 音声入力の「macOS の音声認識」の補助コマンド（native/kickoff-speech/main.swift）を、ビルドのときに out/native/kickoff-speech へ作る。
// electron.vite.config.ts のメインプロセスのビルドに差し込むので、npm run dev・build・dist・install-app のどれでも作られる
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const SOURCE = path.resolve("native/kickoff-speech/main.swift");
const OUTPUT = path.resolve("out/native/kickoff-speech");

/** 例外から、コマンドの標準エラー（なければ例外の文）を取り出す */
const failureText = (e: unknown) => String((e as { stderr?: unknown } | null)?.stderr || e).trim();

/**
 * 補助コマンドを作る（ソースより新しいものがあれば作らない）。Swift のコンパイラ（Xcode の Command Line Tools）がない・
 * macOS 26 の SDK がないなどで作れなくても、ビルドは止めない（その Kickoff では「macOS の音声認識」が選べないだけ）
 */
function buildSpeechHelper(warn: (message: string) => void) {
  if (process.platform !== "darwin") return;
  if (fs.existsSync(OUTPUT) && fs.statSync(OUTPUT).mtimeMs >= fs.statSync(SOURCE).mtimeMs) return;
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  // 古い macOS でも起動して「使えない」と答えられるよう、対象の版は低くしておく（新しい API は実行のときに確かめて使う）
  const target = `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos12.0`;
  try {
    execFileSync("swiftc", ["-O", "-target", target, SOURCE, "-o", OUTPUT], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    fs.rmSync(OUTPUT, { force: true });
    warn(`macOS の音声認識の補助コマンドを作れませんでした（音声入力の「macOS の音声認識」は使えません）: ${failureText(e)}`);
  }
}

/** メインプロセスのビルドの始めに、補助コマンドを作る */
export function speechHelper(): Plugin {
  return {
    name: "kickoff-speech-helper",
    buildStart() {
      this.addWatchFile(SOURCE);
      buildSpeechHelper((message) => this.warn(message));
    },
  };
}
