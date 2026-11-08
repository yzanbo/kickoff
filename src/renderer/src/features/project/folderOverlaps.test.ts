import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOverlapLines, folderOverlaps, memoOverlapLines } from "./folderOverlaps";

const p = (id: number, repo_path: string) => ({ id, name: `p${id}`, repo_path });
const projects = [p(1, "/a/app"), p(2, "/a/app/sub"), p(3, "/a/apple"), p(4, "/a")];

test("folderOverlaps: 同じ・その中・中にあるを分ける（名前の頭が同じだけのフォルダ・自分は数えない）", () => {
  const ids = (o: ReturnType<typeof folderOverlaps>) => [o.same, o.inside, o.contains].map((l) => l.map((x) => x.id));
  assert.deepEqual(ids(folderOverlaps("/a/app/", projects)), [[1], [4], [2]]);
  assert.deepEqual(ids(folderOverlaps("/a/app", projects, 1)), [[], [4], [2]]);
  assert.deepEqual(ids(folderOverlaps("/b", projects)), [[], [], []]);
  assert.deepEqual(ids(folderOverlaps("", projects)), [[], [], []]);
});

test("folderOverlapLines: 同じフォルダは作る・取り込むでは ng、変更・基本情報では warn。メモは warn", () => {
  const o = folderOverlaps("/a/app", projects);
  assert.deepEqual(folderOverlapLines(o, "ng").map((l) => l.kind), ["ng", "warn", "warn"]);
  assert.match(folderOverlapLines(o, "warn")[0].text, /^「p1」のプロジェクトフォルダと同じです/);
  assert.equal(folderOverlapLines(o, "warn")[1].text, "「p4」のプロジェクトフォルダの中です");
  assert.equal(folderOverlapLines(o, "warn")[2].text, "中に「p2」のプロジェクトフォルダがあります");
  assert.deepEqual(memoOverlapLines([]), []);
  assert.equal(memoOverlapLines([p(1, "/x"), p(2, "/y")])[0].text, "「p1」「p2」のメモフォルダと同じです（同じメモを共有します）");
});
