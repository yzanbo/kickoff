import assert from "node:assert/strict";
import { test } from "node:test";
import type { CanUseTool, PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type { ApprovalDecision } from "@shared/types";
import { createCanUseTool } from "./approvals.js";
import type { ApprovalRequest } from "../types.js";

const suggestions: PermissionUpdate[] = [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "ls:*" }], behavior: "allow", destination: "localSettings" }];
const signal = new AbortController().signal;
/** canUseTool に渡す指定のうち、テストで変えるもの */
type Extra = Partial<Pick<Parameters<CanUseTool>[2], "suggestions" | "title" | "description" | "decisionReason" | "suppressAlwaysAllowRule">>;

/** 決まった回答を返す偽の承認で canUseTool を呼び、届いた依頼と判定を返す */
async function ask(decision: ApprovalDecision, toolName: string, input: Record<string, unknown>, opts: Extra = {}) {
  const requests: ApprovalRequest[] = [];
  const canUseTool = createCanUseTool({
    requestApproval: async (request) => {
      requests.push(request);
      return decision;
    },
  });
  const result = await canUseTool(toolName, input, { signal, toolUseID: "t1", requestId: "r1", ...opts });
  return { request: requests[0], result };
}

test("許可の依頼: 許可・いつも許可（提案のルールを適用）・拒否（文があればそれ）・回答は不正", async () => {
  const input = { command: "ls" };
  const allow = await ask({ action: "allow" }, "Bash", input, { suggestions, decisionReason: "理由" });
  assert.equal(allow.request.kind, "permission");
  assert.equal(allow.request.description, "理由");
  assert.equal(allow.request.canRemember, true);
  assert.deepEqual(allow.result, { behavior: "allow", updatedInput: input });

  const always = await ask({ action: "allow_always" }, "Bash", input, { suggestions });
  assert.deepEqual(always.result, { behavior: "allow", updatedInput: input, updatedPermissions: suggestions });
  assert.deepEqual((await ask({ action: "allow_always" }, "Bash", input)).result, { behavior: "allow", updatedInput: input, updatedPermissions: [] });

  assert.deepEqual((await ask({ action: "deny", message: "だめ" }, "Bash", input)).result, { behavior: "deny", message: "だめ" });
  assert.deepEqual((await ask({ action: "deny" }, "Bash", input)).result, { behavior: "deny", message: "ユーザーが拒否しました" });
  assert.deepEqual((await ask({ action: "answer", answers: {} }, "Bash", input)).result, { behavior: "deny", message: "不正な応答です" });

  // 提案がない・いつも許可を出さない指定なら、覚えられない
  assert.equal((await ask({ action: "allow" }, "Bash", input)).request.canRemember, false);
  assert.equal((await ask({ action: "allow" }, "Bash", input, { suggestions, suppressAlwaysAllowRule: true })).request.canRemember, false);
  assert.equal((await ask({ action: "allow" }, "Bash", input, { description: "説明", decisionReason: "理由" })).request.description, "説明");
});

test("質問（AskUserQuestion）: 回答は入力に足して通し、答えなければスキップとして断る", async () => {
  const input = { questions: [{ question: "何を作る？" }] };
  const answered = await ask({ action: "answer", answers: { "何を作る？": "Todo" }, response: "補足" }, "AskUserQuestion", input, { title: "質問" });
  assert.equal(answered.request.kind, "question");
  assert.equal(answered.request.title, "質問");
  assert.equal(answered.request.canRemember, false);
  assert.deepEqual(answered.result, { behavior: "allow", updatedInput: { ...input, answers: { "何を作る？": "Todo" }, response: "補足" } });
  assert.deepEqual((await ask({ action: "answer", answers: { a: ["x", "y"] } }, "AskUserQuestion", input)).result, {
    behavior: "allow",
    updatedInput: { ...input, answers: { a: ["x", "y"] } },
  });
  assert.deepEqual((await ask({ action: "allow" }, "AskUserQuestion", input)).result, { behavior: "deny", message: "ユーザーは質問への回答をスキップしました" });
  assert.deepEqual((await ask({ action: "deny", message: "あとで" }, "AskUserQuestion", input)).result, { behavior: "deny", message: "あとで" });
  assert.deepEqual((await ask({ action: "deny" }, "AskUserQuestion", input)).result, { behavior: "deny", message: "ユーザーは質問への回答をスキップしました" });
});
