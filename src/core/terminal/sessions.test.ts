import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeTerminals } from "../testing/fakeTerminal.js";
import { tempDir } from "../testing/tempDir.js";
import { TerminalSessions } from "./sessions.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
  const fake = fakeTerminals();
  const sessions = new TerminalSessions({
    shell: { file: "/bin/zsh", args: (c) => (c ? ["-l", "-c", c] : ["-l"]) },
    env: { KICKOFF_TERMINAL_OF: "development" },
    envOf: (cwd): Record<string, string> => (cwd.endsWith("wt") ? { PORT: "20100" } : {}),
    spawn: fake.spawn,
  });
  const client = (id: string) => {
    const got = { data: [] as string[], exit: [] as number[] };
    return { got, client: { id, data: (d: string) => void got.data.push(d), exit: (c: number) => void got.exit.push(c) } };
  };
  return { sessions, fake, client };
}

test("TerminalSessions: なければ始め（シェル・環境変数・作業場所の PORT）、あればつなぎ直していまの画面の内容を返す", async () => {
  const { sessions, fake, client } = setup();
  const dir = tempDir();
  const a = client("a");
  const first = await sessions.open({ key: "k", cwd: dir, cols: 80, rows: 24, client: a.client, start: { command: "ls", env: { X: "1" } }, meta: { projectId: 3, title: "T" } });
  assert.equal(first.created, true);
  const shell = fake.spawned[0];
  assert.deepEqual([shell.file, shell.args, shell.cwd], ["/bin/zsh", ["-l", "-c", "ls"], dir]);
  assert.equal(shell.env.KICKOFF_TERMINAL_OF, "development");
  assert.equal(shell.env.X, "1");
  assert.equal(shell.env.TERM, "xterm-256color");
  shell.emit("hello\r\n");
  await wait(30);
  assert.deepEqual(a.got.data, ["hello\r\n"]);
  // あとからつないだ人には、それまでの画面の内容（snapshot）を渡し、そのあとの出力は 2 人とも受け取る
  const b = client("b");
  const second = await sessions.open({ key: "k", cwd: "", cols: 80, rows: 24, client: b.client });
  assert.equal(second.created, false);
  assert.match(second.snapshot, /hello/);
  shell.emit("next");
  await wait(30);
  assert.ok(a.got.data.includes("next") && b.got.data.includes("next"));
  assert.deepEqual(sessions.list(), [{ key: "k", project_id: 3, title: "T", cwd: dir, command: "ls" }]);
  assert.deepEqual((await sessions.tail("k", 5))?.lines, ["hello", "next"]);
  // 書く・大きさ
  sessions.write("k", "pwd\r");
  sessions.resize("k", 100, 30);
  assert.deepEqual(shell.written, ["pwd\r"]);
  assert.deepEqual([shell.cols, shell.rows], [100, 30]);
  // 離れた人には届かない
  sessions.detach("k", "b");
  shell.emit("only-a");
  await wait(30);
  assert.ok(!b.got.data.includes("only-a"));
  // シェルが終わったら、つないでいる人に知らせて一覧から消す
  shell.end(3);
  assert.deepEqual(a.got.exit, [3]);
  assert.deepEqual(sessions.list(), []);
});

test("TerminalSessions: 持ち主のシェルだけを止める。フォルダがなければホームで開いて注意を出す。ワークツリーには PORT", async () => {
  const { sessions, fake, client } = setup();
  await sessions.open({ key: "mine", cwd: tempDir(), cols: 80, rows: 24, client: client("x").client, owner: "wc:1" });
  await sessions.open({ key: "other", cwd: tempDir(), cols: 80, rows: 24, client: client("y").client, owner: "device:2" });
  // 持ち主を渡さずにつないでも（スマホが画面のタブにつなぐ）、持ち主は替わらない
  await sessions.open({ key: "mine", cwd: "", cols: 80, rows: 24, client: client("z").client });
  assert.equal(sessions.ownerOf("mine"), "wc:1");
  sessions.closeOwnedBy("wc:1");
  assert.equal(sessions.has("mine"), false);
  assert.equal(sessions.has("other"), true);
  assert.equal(fake.spawned[0].killed, true);
  const missing = await sessions.open({ key: "gone", cwd: "/no/such/wt", cols: 80, rows: 24, client: client("w").client });
  assert.match(missing.snapshot, /ホームフォルダで開きました/);
  const wt = tempDir();
  const wtDir = `${wt}/wt`;
  (await import("node:fs")).mkdirSync(wtDir);
  await sessions.open({ key: "wt", cwd: wtDir, cols: 80, rows: 24, client: client("v").client });
  assert.equal(fake.spawned.at(-1)!.env.PORT, "20100");
  sessions.closeAll();
  assert.deepEqual(sessions.list(), []);
});
