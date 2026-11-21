import { test } from "vitest";
import assert from "node:assert/strict";
import { makeChat, makeEvent, makeProject } from "@shared/foundation/testing/factories";
import type { ProviderTurnResult } from "@/features/ai/core/index";
import type { TurnContext, TurnContributor, TurnParts } from "./contributor";
import { collectTurnParts } from "./params";

const ctx: TurnContext = { chat: makeChat(1), project: makeProject(1), cwd: "/repo", kind: "message", signal: new AbortController().signal, requestApproval: async () => ({ action: "allow" }) };

/** 決まったものを出す contributor */
const part = (name: string, order: number, parts: TurnParts | null): TurnContributor => ({ name, order, contribute: () => parts });

test("contributor を order の順（同じ order は登録の順）に集める: env は後が上書き・フォルダは重なりを除く・文脈はつなぐ", async () => {
  const got = await collectTurnParts(
    [
      part("chat", 30, { env: { A: "chat", C: "c" }, readableDirs: ["/b", "/a"], turnContext: "一度だけ" }),
      part("worktrees", 10, { env: { A: "wt", B: "b" }, readableDirs: ["/a"], turnContext: "家系" }),
      part("none", 20, null),
      part("move", 20, { turnContext: null, writableDirs: ["/notes"] }),
    ],
    ctx,
  );
  assert.deepEqual(got.env, { A: "chat", B: "b", C: "c" });
  assert.deepEqual(got.readableDirs, ["/a", "/b"]);
  assert.deepEqual(got.writableDirs, ["/notes"]);
  assert.equal(got.turnContext, "家系\n\n一度だけ");
  assert.equal(got.gate, null);
  assert.equal(got.sandbox, null);
  assert.equal(got.sandboxOff, false);
  assert.equal(got.preCompact, null);
});

test("節は order で並べ、見出しの前に空行 1 つ・見出しが null の節は直前の節の行に足す", async () => {
  const got = await collectTurnParts(
    [
      part("browser", 300, { promptSections: [{ order: 300, heading: "## ブラウザ", lines: ["- b"] }] }),
      part("chat", 0, {
        promptSections: [
          { order: 100, heading: "# 指示", lines: ["本文"] },
          { order: 200, heading: "## 進め方", lines: ["- 1"] },
          { order: 210, heading: null, lines: ["- ゴミ箱"] },
        ],
      }),
      part("guard", 0, { promptSections: [{ order: 220, heading: null, lines: ["- 砂場"] }] }),
    ],
    ctx,
  );
  assert.equal(got.systemPrompt, "# 指示\n本文\n\n## 進め方\n- 1\n- ゴミ箱\n- 砂場\n\n## ブラウザ\n- b");
});

test("門・砂場・圧縮前指示は 1 つの contributor だけが出せる（2 つなら失敗）", async () => {
  await assert.rejects(collectTurnParts([part("a", 0, { sandbox: null }), part("b", 1, { sandbox: null })], ctx), /sandbox を a と b が出しました/);
  const got = await collectTurnParts([part("guard", 0, { sandboxOff: true }), part("chat", 1, {})], ctx);
  assert.equal(got.sandboxOff, true);
});

test("包みは先の order が外側、記録と作業の終わりの口は全部", async () => {
  const seen: string[] = [];
  const wrap = (name: string) => async (run: () => Promise<ProviderTurnResult>) => {
    seen.push(`${name}:前`);
    const result = await run();
    seen.push(`${name}:後`);
    return result;
  };
  const records: number[] = [];
  const got = await collectTurnParts(
    [
      part("inner", 20, { around: wrap("内"), onRecord: (e) => records.push(e.id), afterTurn: async () => {} }),
      part("outer", 10, { around: wrap("外"), onRecord: (e) => records.push(-e.id) }),
    ],
    ctx,
  );
  const result = await got.around(async () => (seen.push("動かす"), { status: "completed", sessionId: "s" }));
  assert.equal(result.status, "completed");
  assert.deepEqual(seen, ["外:前", "内:前", "動かす", "内:後", "外:後"]);
  for (const fn of got.onRecord) fn(makeEvent(5, "notice", { message: "x" }));
  assert.deepEqual(records, [-5, 5]);
  assert.equal(got.afterTurn.length, 1);
});
