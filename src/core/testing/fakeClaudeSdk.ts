// 台本どおりに振る舞う偽の Claude Agent SDK（本物の Claude Code・アカウントは使わない。fakeCopilotClient.ts と同じ形）。テストからだけ使う
import type { HookInput, Options, Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeSdk } from "../providers/claude/sdk.js";

/**
 * 偽の SDK のメッセージ。種類のほかは確かめに要る欄だけ書けばよい（SDK の型の必須の欄をすべては埋めない）。
 * 省けば補うもの: session_id（init で渡した ID → 続きのセッション → 振った ID）・uuid・parent_tool_use_id（null = メインエージェント）・assistant の message.usage（0）
 */
export type FakeSdkMessage = { type: SDKMessage["type"] } & Record<string, unknown>;

/** finish に渡す結果（既定は success・result "ok"） */
export interface FakeClaudeResult {
  subtype?: "success" | "error_during_execution" | "error_max_turns";
  result?: string;
  is_error?: boolean;
  errors?: string[];
}

/** 1 回の query の記録と、テストから流す口 */
export interface FakeClaudeQuery {
  /** query に渡された options（hooks・canUseTool・mcpServers・systemPrompt・env・allowedTools・resume・sandbox を確かめる） */
  options: Options;
  /** 入力から届いた発言（最初の発言・tell で足した発言。文字の指示は 1 つの発言にする） */
  received: SDKUserMessage[];
  /** SDK のメッセージを 1 つ流す */
  emit(message: FakeSdkMessage): void;
  /** 結果を流してストリームを閉じる */
  finish(result?: FakeClaudeResult): void;
  /** 結果を流さずにストリームを閉じる（Claude Code が結果を返さずに終わった） */
  end(): void;
  /** 例外で終わらせる（落ちた・断られた） */
  fail(error: Error): void;
  /** フックを呼ぶ（options.hooks の該当の matcher を順に呼び、返りを集める。matcher はツールの名前に当てる） */
  hook(event: "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "PreCompact", input: Record<string, unknown>): Promise<unknown[]>;
  /** canUseTool を呼ぶ */
  canUseTool(toolName: string, input: Record<string, unknown>): Promise<unknown>;
  /** stopTask で止めた作業の ID */
  stopTask: string[];
  /** close されたか */
  closed: boolean;
}

export interface FakeClaudeSdk {
  sdk: ClaudeSdk;
  queries: FakeClaudeQuery[];
  /** query が呼ばれたときの台本（省けば init → 返答 1 つ → success） */
  onQuery: (q: FakeClaudeQuery) => void | Promise<void>;
  forks: { sessionId: string; upToMessageId?: string; dir?: string }[];
  /** forkSession の答え（既定 "forked-1"…） */
  forkResult: () => string;
}

type Item = { message: SDKMessage } | { error: Error } | { end: true };

const ZERO_USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
/** 結果に載せる使ったモデル（コンテキストウィンドウ 200,000） */
const MODEL_USAGE = { "claude-test": { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0, contextWindow: 200_000, maxOutputTokens: 32_000 } };

const userMessage = (text: string): SDKUserMessage => ({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, session_id: "" });

export function fakeClaudeSdk(): FakeClaudeSdk {
  let seq = 0;
  const fake: FakeClaudeSdk = {
    queries: [],
    onQuery: (q) => {
      q.emit({ type: "system", subtype: "init", model: "claude-test", permissionMode: "default" });
      q.emit({ type: "assistant", message: { content: [{ type: "text", text: "できました" }] } });
      q.finish();
    },
    forks: [],
    forkResult: () => `forked-${fake.forks.length}`,
    sdk: {
      query: ({ prompt, options }) => startQuery(prompt, options ?? {}),
      forkSession: async (sessionId, opts) => {
        fake.forks.push({ sessionId, ...(opts?.dir !== undefined ? { dir: opts.dir } : {}), ...(opts?.upToMessageId !== undefined ? { upToMessageId: opts.upToMessageId } : {}) });
        return { sessionId: fake.forkResult() };
      },
      getSubagentMessages: async () => [],
    },
  };

  function startQuery(prompt: string | AsyncIterable<SDKUserMessage>, options: Options): Query {
    let sessionId = options.resume ?? `fake-session-${++seq}`;
    const signal = options.abortController?.signal ?? new AbortController().signal;
    const items: Item[] = [];
    let ended = false;
    let wake: (() => void) | undefined;
    const push = (item: Item) => {
      if (ended) return;
      items.push(item);
      if (!("message" in item)) ended = true;
      wake?.();
    };
    async function* stream(): AsyncGenerator<SDKMessage, void> {
      while (true) {
        const item = items.shift();
        if (!item) {
          await new Promise<void>((resolve) => (wake = resolve));
          continue;
        }
        if ("error" in item) throw item.error;
        if ("end" in item) return;
        yield item.message;
      }
    }
    const fill = (m: FakeSdkMessage): SDKMessage => {
      if (m.type === "system" && m.subtype === "init" && typeof m.session_id === "string") sessionId = m.session_id;
      const main = m.type === "assistant" || m.type === "user" || m.type === "stream_event" ? { parent_tool_use_id: null } : {};
      const usage = m.type === "assistant" ? { message: { usage: ZERO_USAGE, ...(m.message as object) } } : {};
      // 偽のメッセージは確かめに要る欄だけを持つ（型の必須の欄をすべては埋めないので、言い切る）
      return { session_id: sessionId, uuid: `uuid-${++seq}`, ...main, ...m, ...usage } as unknown as SDKMessage;
    };
    const record: FakeClaudeQuery = {
      options,
      received: typeof prompt === "string" ? [userMessage(prompt)] : [],
      stopTask: [],
      closed: false,
      emit: (m) => push({ message: fill(m) }),
      finish: ({ subtype = "success", result = "ok", is_error = subtype !== "success", errors = [] } = {}) => {
        const outcome = subtype === "success" ? { result } : { errors };
        push({ message: fill({ type: "result", subtype, is_error, ...outcome, num_turns: 1, total_cost_usd: 0, duration_ms: 0, duration_api_ms: 0, stop_reason: null, usage: ZERO_USAGE, modelUsage: MODEL_USAGE, permission_denials: [] }) });
        push({ end: true });
      },
      end: () => push({ end: true }),
      fail: (error) => push({ error }),
      hook: async (event, input) => {
        const full = { hook_event_name: event, session_id: sessionId, transcript_path: "", cwd: options.cwd ?? "", ...input } as unknown as HookInput;
        const toolName = typeof input.tool_name === "string" ? input.tool_name : null;
        const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : undefined;
        const out: unknown[] = [];
        for (const matcher of options.hooks?.[event] ?? []) {
          if (matcher.matcher && toolName !== null && !new RegExp(`^(?:${matcher.matcher})$`).test(toolName)) continue;
          for (const hook of matcher.hooks) out.push(await hook(full, toolUseId, { signal }));
        }
        return out;
      },
      canUseTool: async (toolName, input) => {
        if (!options.canUseTool) throw new Error("canUseTool が渡されていません");
        return options.canUseTool(toolName, input, { signal, toolUseID: `toolu-${++seq}`, requestId: `req-${seq}` });
      },
    };
    // 止められたら、本物と同じく繰り返しを例外で終える
    const abort = () => push({ error: Object.assign(new Error("Claude Code process aborted by user"), { name: "AbortError" }) });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    // 入力（ストリーミング）を読み続ける（tell で足した発言も届く）
    if (typeof prompt !== "string") {
      void (async () => {
        for await (const m of prompt) record.received.push(m);
      })().catch(() => {});
    }
    const q = Object.assign(stream(), {
      stopTask: async (taskId: string) => {
        record.stopTask.push(taskId);
      },
      close: () => {
        record.closed = true;
        push({ end: true });
      },
      supportedModels: async () => [],
      supportedCommands: async () => [],
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => ({}),
    });
    fake.queries.push(record);
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => fake.onQuery(record))
        .catch((e: unknown) => record.fail(e instanceof Error ? e : new Error(String(e))));
    });
    // Query の口のうち、ClaudeProvider が使うもの（繰り返し・stopTask・close・一覧と使用枠）だけを持つ（ほかの制御の口は持たないので、言い切る）
    return q as unknown as Query;
  }

  return fake;
}
