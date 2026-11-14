import { test } from "node:test";
import assert from "node:assert/strict";
import { trashMarksIn } from "./marks";

test("trashMarksIn: kickoff-trash の印の行だけを、出た順に 1 つずつ読む", () => {
  const out = [
    "Kickoff のゴミ箱に入れました（3 日は元に戻せます）: /work/app/dist [kickoff-trash:0b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b]",
    "kickoff-trash: x: ありません",
    "Kickoff のゴミ箱に入れました（3 日は元に戻せます）: /work/a b.txt [kickoff-trash:1b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b]",
    "Kickoff のゴミ箱に入れました（3 日は元に戻せます）: /work/app/dist [kickoff-trash:0b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b]",
  ].join("\n");
  assert.deepEqual(trashMarksIn(out), [
    { id: "0b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b", origin: "/work/app/dist" },
    { id: "1b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b", origin: "/work/a b.txt" },
  ]);
  assert.deepEqual(trashMarksIn("ほかの出力"), []);
});
