// プロバイダーの確かめの共通の部品: 実行の指定 turnParams・AI の操作ツールの口 chatToolEndpoint・知らせを覚えるコールバック recorder と、
// どの AI でも同じに振る舞うことを確かめる筋書き PROVIDER_SCENARIOS（台本 FakeAgentScript を adapter が各偽物へ写す）。テストからだけ使う
import assert from "node:assert/strict";
import type { ApprovalReply } from "@shared/ai/approvals";
import { deferred } from "@shared/foundation/testing/async";
import type { ApiRetryInfo } from "@shared/ai/turnEvents";
import { permissionOnlyGate } from "@/features/ai/core/permissionMode";
import type { ToolEndpoint } from "@/foundation/core/aiTools/host";
import { until } from "@/foundation/core/testing/until";
import { withGate, type TestGuardMaterials } from "@/app/core/testing/testGate";
import type { AgentProvider, ApprovalRequest, ProviderCallbacks, ProviderTurnParams, TurnControl } from "@/features/ai/core/providers/types";

/** 実行の指定（どのプロバイダーの確かめにも使える最小の形。patch で足す・替える） */
export function turnParams(patch: Partial<ProviderTurnParams> = {}): ProviderTurnParams {
  return {
    cwd: "/w",
    prompt: "やって",
    promptId: "u-1",
    compact: false,
    systemPrompt: "Kickoff の文脈",
    resumeSessionId: null,
    model: null,
    effort: null,
    permissionMode: "default",
    fastMode: false,
    autoCompactPct: null,
    additionalDirectories: [],
    sandbox: null,
    sandboxOff: false,
    gate: permissionOnlyGate({ permissionMode: patch.permissionMode ?? "default", cb: { requestApproval: async () => ({ action: "deny", message: "" }) }, signal: new AbortController().signal }),
    ...patch,
  };
}

/** AI の操作ツール kickoff_chat の口（鍵 secret-key の見出し付き。鍵が引数・環境変数に出ないことを確かめる） */
export const chatToolEndpoint = (autoAllow: string[] = []): ToolEndpoint => ({ name: "kickoff_chat", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: { Authorization: "Bearer secret-key" }, autoAllow });

/** 知らせを覚え、承認には answer で答えるコールバック */
export function recorder(answer: (req: ApprovalRequest) => ApprovalReply = () => ({ action: "allow" })) {
  // 知らせの形はプロバイダーごとの確かめで欄を読む（どの種類かは各テストが見分ける）
  const events: any[] = [];
  const approvals: ApprovalRequest[] = [];
  const streamed: string[] = [];
  const contexts: number[] = [];
  const retries: (ApiRetryInfo | null)[] = [];
  let control: TurnControl | null = null;
  const cb: ProviderCallbacks = {
    emit: (e) => events.push(e),
    stream: (t) => streamed.push(t),
    requestApproval: async (req) => {
      approvals.push(req);
      return answer(req);
    },
    context: (tokens) => contexts.push(tokens),
    retry: (info) => retries.push(info),
    control: (c) => {
      control = c;
    },
  };
  return { cb, events, approvals, streamed, contexts, retries, control: () => control };
}

/**
 * 偽の AI に流させる台本の 1 歩（どの偽物にも写せる共通の出来事。adapter が各偽物の手続きへ写す）。
 * init は各偽物が始めに出す。ask はコマンドを流してよいかを聞き、答えを FakeAgent の answers に残す。hold は release() か止める合図まで待つ
 */
export type FakeAgentStep =
  | { type: "tool_use"; id: string; command: string }
  | { type: "tool_result"; id: string; output: string }
  | { type: "text"; text: string }
  | { type: "ask"; command: string }
  | { type: "hold" };

/** 偽の AI の台本（終わりの理由: 既定は completed。crashed は AI のプロセスが落ちる） */
export interface FakeAgentScript {
  steps: FakeAgentStep[];
  end?: "completed" | "crashed";
}

/** ask の答え（allow = 流してよい・deny = 断った） */
export type FakeAgentAnswer = "allow" | "deny";

/** 台本で動く偽の AI と、偽物に届いたものの読み口 */
export interface FakeAgent {
  provider: AgentProvider;
  /** hold で待っているか */
  holding(): boolean;
  /** hold の待ちを終える */
  release(): void;
  answers: FakeAgentAnswer[];
  /** 作業中に足した発言のうち、偽物に届いたもの */
  told(): string[];
  /** 続きとして開いたセッションの ID */
  resumedFrom(): string | null;
  /** 起動した回の引数と環境変数 */
  launches(): { args: string[]; env: Record<string, string | undefined> }[];
  /** AI の操作ツールの口を渡した設定 */
  toolConfig(): unknown;
}

/** プロバイダーの適合テストの adapter（tellAtTurnEnd: 作業中に足した発言を、いまの指示が終わってから届けるか = ACP。crashError: 落ちたときの失敗の文） */
export interface ProviderAdapter {
  id: "claude" | "codex" | "copilot" | "acp";
  tellAtTurnEnd: boolean;
  crashError: RegExp;
  make(script: FakeAgentScript): FakeAgent;
}

/** hold の待ち合わせ（adapter が台本の hold で使う） */
export function holdPoint() {
  let reached = false;
  const gate = deferred<void>();
  return {
    reached: () => reached,
    wait: () => {
      reached = true;
      return gate.promise;
    },
    release: () => gate.resolve(),
  };
}

/** 台本の最後の返答の文 */
export const lastText = (script: FakeAgentScript): string | null => script.steps.findLast((s) => s.type === "text")?.text ?? null;

/** 本物の守りの門を付けて 1 回動かす（門の承認カードも recorder で答える） */
function start(agent: FakeAgent, patch: Partial<ProviderTurnParams> = {}, opts: { answer?: (req: ApprovalRequest) => ApprovalReply; materials?: TestGuardMaterials; signal?: AbortSignal } = {}) {
  const rec = recorder(opts.answer);
  const signal = opts.signal ?? new AbortController().signal;
  const result = agent.provider.run(withGate(turnParams(patch), rec.cb.requestApproval, signal, opts.materials ?? {}), rec.cb, signal);
  return { rec, result };
}

const MODES: ProviderTurnParams["permissionMode"][] = ["default", "acceptEdits", "auto", "plan"];

/** どの AI でも同じに振る舞うことを確かめる 7 つの筋書き（contract.test.ts が adapter ごとに流す） */
export const PROVIDER_SCENARIOS: readonly { name: string; run(a: ProviderAdapter): Promise<void> }[] = [
  {
    name: "実行: 記録を init・tool_use・tool_result・text の順に届け、完了と返答の文・セッションを返す",
    async run(a) {
      const agent = a.make({ steps: [{ type: "tool_use", id: "c1", command: "ls" }, { type: "tool_result", id: "c1", output: "a.ts" }, { type: "text", text: "できました" }] });
      const { rec, result } = start(agent);
      const done = await result;
      assert.deepEqual(
        rec.events.map((e) => e.type),
        ["init", "tool_use", "tool_result", "text"],
      );
      assert.deepEqual([rec.events[1].name, rec.events[1].input], ["Bash", { command: "ls" }]);
      assert.equal(rec.events[2].tool_use_id, rec.events[1].id);
      assert.equal(String(rec.events[2].content).trim(), "a.ts");
      assert.equal(rec.events[3].text, "できました");
      assert.equal(done.status, "completed");
      assert.equal(done.result, "できました");
      assert.equal(typeof done.sessionId, "string");
    },
  },
  {
    name: "続き: 前のセッションを続きとして開き、同じセッションの ID を返す",
    async run(a) {
      const agent = a.make({ steps: [{ type: "text", text: "続けます" }] });
      const done = await start(agent, { resumeSessionId: "s-old" }).result;
      assert.equal(done.status, "completed");
      assert.equal(agent.resumedFrom(), "s-old");
      assert.equal(done.sessionId, "s-old");
    },
  },
  {
    name: "守り: 消すコマンドは、権限モードによらず承認カードを出さずに断る",
    async run(a) {
      for (const permissionMode of MODES) {
        const agent = a.make({ steps: [{ type: "ask", command: "rm -rf build" }] });
        const { rec, result } = start(agent, { permissionMode }, { materials: { deleteGuard: true } });
        assert.equal((await result).status, "completed", permissionMode);
        assert.deepEqual(agent.answers, ["deny"], permissionMode);
        assert.equal(rec.approvals.length, 0, permissionMode);
      }
    },
  },
  {
    name: "権限モード: 毎回確認は承認カードで聞き、計画モードは断り、Auto mode は聞かずに通す",
    async run(a) {
      for (const [permissionMode, answer, asked] of [
        ["default", "allow", 1],
        ["plan", "deny", 0],
        ["auto", "allow", 0],
      ] as const) {
        const agent = a.make({ steps: [{ type: "ask", command: "npm install" }] });
        const { rec, result } = start(agent, { permissionMode });
        await result;
        assert.deepEqual(agent.answers, [answer], permissionMode);
        assert.equal(rec.approvals.length, asked, permissionMode);
      }
    },
  },
  {
    name: "伝える: 作業中に足した発言が AI に届き、終わったら作業中の操作を外す",
    async run(a) {
      const agent = a.make({ steps: [{ type: "hold" }, { type: "text", text: "了解" }] });
      const { rec, result } = start(agent);
      await until(() => agent.holding() && rec.control() !== null);
      assert.equal(rec.control()!.tell("これも", "u-2"), true);
      if (!a.tellAtTurnEnd) await until(() => agent.told().includes("これも"));
      agent.release();
      assert.equal((await result).status, "completed");
      await until(() => agent.told().includes("これも"));
      assert.deepEqual(agent.told(), ["これも"]);
      assert.equal(rec.control(), null);
    },
  },
  {
    name: "止める・落ちる: 作業中に止めると cancelled、AI のプロセスが落ちたら failed",
    async run(a) {
      const agent = a.make({ steps: [{ type: "hold" }] });
      const ac = new AbortController();
      const { result } = start(agent, {}, { signal: ac.signal });
      await until(() => agent.holding());
      ac.abort();
      assert.equal((await result).status, "cancelled");

      const crashed = a.make({ steps: [{ type: "text", text: "途中" }], end: "crashed" });
      const failed = await start(crashed).result;
      assert.equal(failed.status, "failed");
      assert.match(failed.error ?? "", a.crashError);
    },
  },
  {
    name: "鍵を載せない: AI の操作ツールの鍵はツールの口の設定でだけ渡し、起動の引数・環境変数に出さない",
    async run(a) {
      const agent = a.make({ steps: [{ type: "text", text: "できました" }] });
      assert.equal((await start(agent, { tools: [chatToolEndpoint()] }).result).status, "completed");
      assert.ok(JSON.stringify(agent.toolConfig()).includes("secret-key"));
      assert.ok(agent.launches().length > 0);
      for (const launch of agent.launches()) assert.ok(!JSON.stringify(launch).includes("secret-key"));
    },
  },
];
