// Claude Code の会話記録のファイルを探す・直近の区切りだけ切り出す・ゴミ箱へ移す
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tempDir } from "../../testing/tempDir.js";
import { findSessionFile, listSessionFiles, readSessionHead, recentSegmentsRange, sessionFileInfo, trashSessions, trimToRecentSegments, writeRecentSegments } from "./sessionFiles.js";

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

test("分岐する位置の手前で、直近 keep 個（既定 3・子チャットは 1）の区切りが始まる位置から、位置の行の終わりまでを返す", async () => {
  const lines = [msg("a"), boundary("b1"), msg("c"), boundary("b2"), msg("d"), boundary("b3"), msg("e"), msg("f"), boundary("b4"), msg("g")];
  const { path } = sessionFile(lines);
  const text = readFileSync(path, "utf8");
  const slice = async (keep?: number) => {
    const range = await recentSegmentsRange(path, "f", keep);
    assert.ok(range);
    return text.slice(range.start, range.end);
  };
  // 位置（f）より後ろの区切り（b4）は数えない。既定は手前の b3・b2・b1 の 3 つ → b1 から f まで
  assert.equal(await slice(), [boundary("b1"), msg("c"), boundary("b2"), msg("d"), boundary("b3"), msg("e"), msg("f")].join("\n") + "\n");
  assert.equal(await slice(2), [boundary("b2"), msg("d"), boundary("b3"), msg("e"), msg("f")].join("\n") + "\n");
  // 子チャット: 最後の要約とそのあとだけ
  assert.equal(await slice(1), [boundary("b3"), msg("e"), msg("f")].join("\n") + "\n");
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
  const range = await recentSegmentsRange(path, "e", 2);
  assert.ok(range);
  assert.equal(readFileSync(path, "utf8").slice(range.start, range.start + boundary("b1").length), boundary("b1"));
});

test("切り出した区切りを、sessionId の欄だけ別の ID にして同じフォルダに書く（本文に出てくる ID は変えない）", async () => {
  const lines = [msg("a"), boundary("b1"), msg("c", `前のセッション ${SID} の話`), boundary("b2"), msg("d"), msg("after")];
  const { path } = sessionFile(lines);
  const copy = await writeRecentSegments(path, SID, "d", 2);
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

test("乗り換え: 終わりの直近 3 区切りだけを、発言の ID はそのまま・sessionId だけ新しい ID にして書く。区切りが足りなければ null", async () => {
  const lines = [msg("a"), boundary("b1"), msg("c"), boundary("b2"), msg("d"), boundary("b3"), msg("e"), line({ type: "file-history-snapshot", messageId: "e" })];
  const { path } = sessionFile(lines);
  const trimmed = await trimToRecentSegments(path, SID);
  assert.ok(trimmed);
  const written = readFileSync(trimmed.path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(
    written.map((l) => l.uuid ?? l.type),
    ["b1", "c", "b2", "d", "b3", "e", "file-history-snapshot"],
  );
  assert.ok(written.every((l) => l.sessionId === trimmed.sessionId));
  assert.equal(trimmed.dropped, Buffer.byteLength(msg("a")) + 1);
  // 元は変えない
  assert.equal(readFileSync(path, "utf8"), lines.join("\n") + "\n");
  // 区切りが 2 つだけなら切るものがない
  const short = sessionFile([msg("a"), boundary("b1"), msg("c"), boundary("b2"), msg("d")]);
  assert.equal(await trimToRecentSegments(short.path, SID), null);
});

test("記録の頭から作業フォルダと最初の自分の発言を読む（< で始まる知らせ・メタの行は飛ばす）。すべての記録の一覧", async () => {
  const lines = [
    line({ type: "system", cwd: "/work/app" }),
    line({ type: "user", isMeta: true, message: { content: "メタ" } }),
    line({ type: "user", message: { content: "<command-name>/clear</command-name>" } }),
    line({ type: "user", message: { content: [{ type: "text", text: "  ログインの不具合を直して  " }] } }),
  ];
  const { root, path } = sessionFile(lines);
  assert.deepEqual(await readSessionHead(path), { cwd: "/work/app", firstPrompt: "ログインの不具合を直して" });
  const all = await listSessionFiles(root);
  assert.equal(all.length, 1);
  assert.equal(all[0].sessionId, SID);
  assert.equal(all[0].firstPrompt, "ログインの不具合を直して");
  assert.equal((await sessionFileInfo(SID, ["/work/app"], root))?.file, path);
});

test("乗り換え: 同じ名前のフォルダ（サブエージェントの記録など）は新しいセッションの名前に移す", async () => {
  const { path } = sessionFile([msg("a"), boundary("b1"), msg("c"), boundary("b2"), msg("d"), boundary("b3"), msg("e")]);
  const dir = path.replace(/\.jsonl$/, "");
  mkdirSync(join(dir, "subagents"), { recursive: true });
  writeFileSync(join(dir, "subagents", "agent-1.jsonl"), "{}\n");
  const trimmed = await trimToRecentSegments(path, SID);
  assert.ok(trimmed);
  assert.equal(existsSync(dir), false);
  assert.equal(readFileSync(join(trimmed.path.replace(/\.jsonl$/, ""), "subagents", "agent-1.jsonl"), "utf8"), "{}\n");
});
