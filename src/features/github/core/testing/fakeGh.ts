// テストの偽の gh: PATH の先頭に置いた sh のスクリプト。呼ばれた引数を 1 回 1 行で書き残し、引数の形（sh の case の型）ごとに決まった出力を返す
import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";

/** answers は [引数の型（sh の case。例 "pr view "*）, 標準出力] の並び（上から先に当たる）。呼ばれた引数を読む関数を返す */
export function fakeGh(answers: [pattern: string, stdout: string][]): () => string[] {
  const bin = tempDir();
  const log = path.join(bin, "calls.log");
  const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
  const script = ["#!/bin/sh", `echo "$*" >> ${quote(log)}`, 'case "$*" in', ...answers.map(([pattern, out]) => `  ${pattern}) printf '%s\\n' ${quote(out)} ;;`), "esac"].join("\n");
  fs.writeFileSync(path.join(bin, "gh"), `${script}\n`, { mode: 0o755 });
  vi.stubEnv("PATH", `${bin}${path.delimiter}${process.env.PATH ?? ""}`);
  return () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []);
}
