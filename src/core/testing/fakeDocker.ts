// テスト用の偽の docker（決まった出力を返すスクリプト）。テストからだけ使う。
// 呼ばれた引数とフォルダを覚え、rules の最初に合うもの（引数をつないだ文に match が含まれる）の出力・終了コードを返す
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./tempDir.js";

export interface FakeDockerRule {
  /** 引数を空白でつないだ文に含まれる文字 */
  match: string;
  stdout?: string;
  stderr?: string;
  code?: number;
  /** 終わらない（docker events・止めるまで終わらない up -d） */
  hang?: boolean;
}

/** 何も足さないときの答え（エンジンは動いていて、コンテナはない） */
const DEFAULT_RULES: FakeDockerRule[] = [
  { match: "version", stdout: "29.0.0\n" },
  { match: "context show", stdout: "orbstack\n" },
  { match: "ps -a", stdout: "" },
  { match: "events", hang: true },
];

const SCRIPT = `
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
const rules = JSON.parse(fs.readFileSync(path.join(dir, "rules.json"), "utf8"));
const line = args.join(" ");
const rule = rules.find((r) => line.includes(r.match));
if (!rule) process.exit(0);
if (rule.stdout) process.stdout.write(rule.stdout);
if (rule.stderr) process.stderr.write(rule.stderr);
if (rule.hang) setInterval(() => {}, 1000);
else process.exitCode = rule.code ?? 0;
`;

/** 偽の docker を作る。bin を DockerCli に渡す */
export function fakeDocker() {
  const dir = tempDir();
  const bin = path.join(dir, "docker");
  fs.writeFileSync(path.join(dir, "fake.cjs"), SCRIPT);
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(dir, "fake.cjs")}" "$@"\n`, { mode: 0o755 });
  const write = (rules: FakeDockerRule[]) => fs.writeFileSync(path.join(dir, "rules.json"), JSON.stringify([...rules, ...DEFAULT_RULES]));
  write([]);
  return {
    bin,
    /** 答えを決める（前に足したものは捨てる。足さなかったものは既定の答え） */
    set: write,
    /** 呼ばれた引数とフォルダ（呼ばれた順） */
    calls(): { args: string[]; cwd: string }[] {
      const file = path.join(dir, "calls.jsonl");
      if (!fs.existsSync(file)) return [];
      return fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { args: string[]; cwd: string });
    },
    /** 呼ばれた記録を消す */
    clearCalls() {
      fs.rmSync(path.join(dir, "calls.jsonl"), { force: true });
    },
  };
}
