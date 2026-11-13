// Claude Code の会話記録のファイルを探す・直近の区切りだけ切り出す・ゴミ箱へ移す
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tempDir } from "../../testing/tempDir.js";
import { findSessionFile, recentSegmentsRange, trashSessions, writeRecentSegments } from "./sessionFiles.js";

const SID = "11111111-1111-1111-1111-111111111111";
const line = (o: object) => JSON.stringify({ sessionId: SID, ...o });
const msg = (uuid: string, text = uuid) => line({ type: "user", uuid, message: { content: text } });
const boundary = (uuid: string) => line({ type: "system", subtype: "compact_boundary", uuid, parentUuid: null });

/** 記録のファイルを作る（root/<作業フォルダの名前>/<SID>.jsonl） */
function sessionFile(lines: string[], cwd = "/work/app") {
  const root = tempDir();
  const dir = join(root, cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${SID}.jsonl`);
  writeFileSync(path, lines.join("\n") + "\n");
  return { root, path };
}

test("分岐する位置の手前で、直近 2 つの区切りが始まる位置から、位置の行の終わりまでを返す", async () => {
  const lines = [msg("a"), boundary("b1"), msg("c"), boundary("b2"), msg("d"), boundary("b3"), msg("e"), msg("f"), boundary("b4"), msg("g")];
  const { path } = sessionFile(lines);
  const range = await recentSegmentsRange(path, "f");
  const text = readFileSync(path, "utf8");
  assert.ok(range);
  // 位置（f）より後ろの区切り（b4）は数えない。手前の b3・b2 の 2 つ → b2 から f まで
  assert.equal(text.slice(range.start, range.end), [boundary("b2"), msg("d"), boundary("b3"), msg("e"), msg("f")].join("\n") + "\n");
});

test("手前の区切りが足りない・位置が見つからないときは null（呼ぶ側は丸ごと写す）", async () => {
  const { path } = sessionFile([msg("a"), boundary("b1"), msg("c")]);
  assert.equal(await recentSegmentsRange(path, "c"), null);
  assert.equal(await recentSegmentsRange(path, "nothing"), null);
});

test("大きなファイルでも、読む塊の境目にかかった行を正しく読む", async () => {
  const pad = "x".repeat(5 << 20);
  const lines = [msg("a", pad), boundary("b1"), msg("c", pad), boundary("b2"), msg("d", pad), msg("e")];
  const { path } = sessionFile(lines);
  const range = await recentSegmentsRange(path, "e");
  assert.ok(range);
  assert.equal(readFileSync(path, "utf8").slice(range.start, range.start + boundary("b1").length), boundary("b1"));
});

test("切り出した区切りを、sessionId の欄だけ別の ID にして同じフォルダに書く（本文に出てくる ID は変えない）", async () => {
  const lines = [msg("a"), boundary("b1"), msg("c", `前のセッション ${SID} の話`), boundary("b2"), msg("d"), msg("after")];
  const { path } = sessionFile(lines);
  const copy = await writeRecentSegments(path, SID, "d");
  assert.ok(copy);
  assert.equal(join(copy.path, ".."), join(path, ".."));
  const written = readFileSync(copy.path, "utf8").trim().split("\n");
  assert.deepEqual(written.map((l) => JSON.parse(l).uuid), ["b1", "c", "b2", "d"]);
  assert.ok(written.every((l) => JSON.parse(l).sessionId === copy.sessionId));
  assert.equal(JSON.parse(written[1]).message.content, `前のセッション ${SID} の話`);
});

test("記録のファイルは作業フォルダから決まる場所を先に、なければすべてのプロジェクトのフォルダから探す", async () => {
  const { root, path } = sessionFile([msg("a")], "/somewhere/else");
  assert.equal(await findSessionFile(SID, ["/work/app", "/somewhere/else"], root), path);
  assert.equal(await findSessionFile(SID, ["/work/app"], root), path);
  assert.equal(await findSessionFile("22222222-2222-2222-2222-222222222222", ["/work/app"], root), null);
});

test("ゴミ箱へ移すのは記録と、同じ名前のフォルダ（サブエージェントの記録など）。見つからないセッションは飛ばす", async () => {
  const { root, path } = sessionFile([msg("a")]);
  mkdirSync(path.replace(/\.jsonl$/, ""));
  const trashed: string[] = [];
  const moved = await trashSessions([SID, "33333333-3333-3333-3333-333333333333"], ["/work/app"], async (p) => void trashed.push(p), root);
  assert.equal(moved, 1);
  assert.deepEqual(trashed, [path, path.replace(/\.jsonl$/, "")]);
});
