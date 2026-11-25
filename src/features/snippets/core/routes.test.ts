// API のテスト: 定型文（作る・変える・範囲の切り替え・並べ替え・消す・プロジェクトを消したとき）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { Snippet } from "@shared/snippets/types";
import type { BusEvent } from "@shared/foundation/contract";
import { setup } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("定型文: 作る・変える・範囲を切り替える・並べ替える・消す。変えたら知らせる", async () => {
  const { api, project, bus } = setup({ features: ["snippets"] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));

  const common = await api("POST /api/snippets", { body: { project_id: null, label: "  ", text: "テストを流して\n結果を教えて" } });
  assert.equal(common.status, 201);
  // 空白だけの名前は null（本文の 1 行目を見せる）
  assert.equal(common.body.label, null);
  assert.equal(common.body.project_id, null);
  const mine = (await api("POST /api/snippets", { body: { project_id: project.id, label: "確認", text: "確認して" } })).body;
  assert.equal(mine.project_id, project.id);
  assert.ok(mine.position > common.body.position);
  assert.ok(events.some((e) => e.type === "snippet" && e.snippet.id === mine.id));

  // 範囲をすべてのプロジェクトに切り替える・名前を消す
  const patched = await api("PATCH /api/snippets/:snippetId", { params: { snippetId: mine.id }, body: { project_id: null, label: null } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.project_id, null);
  assert.equal(patched.body.label, null);
  assert.equal(patched.body.text, "確認して");

  // 並べ替え（書いていないものは後ろに続く）
  const third = (await api("POST /api/snippets", { body: { project_id: null, label: null, text: "3" } })).body;
  const ordered = (await api("PUT /api/snippets/order", { body: { ids: [third.id, common.body.id] } })).body;
  assert.deepEqual(
    ordered.map((s) => s.id),
    [third.id, common.body.id, mine.id],
  );
  assert.deepEqual(
    (await api("GET /api/snippets")).body.map((s: Snippet) => s.id),
    [third.id, common.body.id, mine.id],
  );

  assert.equal((await api("DELETE /api/snippets/:snippetId", { params: { snippetId: third.id } })).status, 204);
  assert.ok(events.some((e) => e.type === "snippet_deleted" && e.id === third.id));
  assert.equal((await api("DELETE /api/snippets/:snippetId", { params: { snippetId: third.id } })).status, 404);
});

test("定型文: 本文が空白だけ・ないプロジェクトは断り、プロジェクトを消すとそのプロジェクトだけのものも消える", async () => {
  const { api, store } = setup({ features: ["snippets"] });
  assert.equal((await api("POST /api/snippets", { body: { project_id: null, label: null, text: " \n " } })).status, 400);
  assert.equal((await api("POST /api/snippets", { body: { project_id: 9999, label: null, text: "a" } })).status, 404);

  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const only = (await api("POST /api/snippets", { body: { project_id: other.id, label: null, text: "a" } })).body;
  assert.equal((await api("PATCH /api/snippets/:snippetId", { params: { snippetId: only.id }, body: { project_id: 9999 } })).status, 404);
  const common = (await api("POST /api/snippets", { body: { project_id: null, label: null, text: "b" } })).body;
  store.projects.delete(other.id);
  assert.deepEqual(
    (await api("GET /api/snippets")).body.map((s: Snippet) => s.id),
    [common.id],
  );
});
