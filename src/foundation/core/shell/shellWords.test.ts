import assert from "node:assert/strict";
import { test } from "vitest";
import { commandWords, gitParts, scanCommands, shellScriptOf, splitCommands, type Word } from "./shellWords";

const texts = (segments: Word[][]) => segments.map((s) => s.map((w) => w.text));

test("splitCommands: 区切り・引用・エスケープ・$(…)・リダイレクト・コメントを読む", () => {
  assert.deepEqual(texts(splitCommands("a b && c || d; e | f & g\nh (i)")), [["a", "b"], ["c"], ["d"], ["e"], ["f"], ["g"], ["h"], ["i"]]);
  assert.deepEqual(texts(splitCommands(`echo 'a b' "c \\"d\\"" e\\ f`)), [["echo", "a b", 'c "d"', "e f"]]);
  assert.deepEqual(texts(splitCommands("ls > out.log 2>&1 < in; cat")), [["ls"], ["cat"]]);
  assert.deepEqual(texts(splitCommands("echo hi # rm -rf /")), [["echo", "hi"]]);
  const [[, sub, quoted, plain]] = splitCommands('echo $(pwd) "$HOME" x');
  assert.deepEqual([sub.dynamic, quoted.dynamic, plain.dynamic], [true, true, false]);
});

test("commandWords: 行頭の VAR=値と前に付けるもの（sudo・env など）を外す", () => {
  const [segment] = splitCommands("FOO=1 sudo env BAR=$X nice rm -rf x");
  const { words, env } = commandWords(segment);
  assert.deepEqual(
    words.map((w) => w.text),
    ["rm", "-rf", "x"],
  );
  assert.deepEqual(env, { FOO: "1" });
});

test("gitParts: サブコマンドより前のオプション（値を取るものも）・サブコマンド・後ろに分ける（git でなければ null）", () => {
  const parts = gitParts(splitCommands("/usr/bin/git -C dir -c a=b --no-pager commit -m x")[0]);
  assert.deepEqual(parts && { globals: parts.globals.map((w) => w.text), sub: parts.sub, args: parts.args.map((w) => w.text) }, {
    globals: ["-C", "dir", "-c", "a=b", "--no-pager"],
    sub: "commit",
    args: ["-m", "x"],
  });
  assert.equal(gitParts(splitCommands("ls")[0]), null);
});

test("shellScriptOf: sh -c・bash -lc の中の文（シェルでない・-c がなければ null）", () => {
  assert.equal(shellScriptOf(splitCommands("bash -lc 'rm x'")[0]), "rm x");
  assert.equal(shellScriptOf(splitCommands("/bin/sh -c \"echo $A\"")[0]), "echo $A");
  assert.equal(shellScriptOf(splitCommands("bash script.sh")[0]), null);
  assert.equal(shellScriptOf(splitCommands("python -c 'x'")[0]), null);
});

test("scanCommands: 最初に返った値を返し、sh -c の中へ 3 段まで下りる", () => {
  const findRm = (segment: Word[]) => (commandWords(segment).words[0]?.text === "rm" ? "rm" : null);
  assert.equal(scanCommands("ls; rm x", findRm), "rm");
  assert.equal(scanCommands("ls && echo ok", findRm), null);
  assert.equal(scanCommands(`bash -c "sh -c 'rm x'"`, findRm), "rm");
  // 4 段目は見ない（depth を渡せば変えられる）
  const nested = (n: number): string => (n === 0 ? "rm x" : `sh -c ${JSON.stringify(nested(n - 1))}`);
  assert.equal(scanCommands(nested(3), findRm), "rm");
  assert.equal(scanCommands(nested(4), findRm), null);
  assert.equal(scanCommands(nested(1), findRm, 0), null);
  // 先に見つかったほうを返す
  const words: string[] = [];
  scanCommands("a; sh -c 'b; c'; d", (segment) => void words.push(commandWords(segment).words[0].text));
  assert.deepEqual(words, ["a", "sh", "b", "c", "d"]);
});
