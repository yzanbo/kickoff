// 長いチャットの記録を、決まった形・種で組み立てる（索引 ＋ 末尾 = 全件の同値のテスト用。メモの仕様書「0023_表示を軽くする」の案 4）。
// サブエージェント（待つ形・裏・入れ子・SendMessage で再開・fork の仮の結果・通信で止まった・出力の上限・報告が届かない・SubagentHandback・
// チャット欄から伝えた指示）・ToDo（TodoWrite の書き直し・TaskCreate / TaskUpdate・セッションの切り替え・コンテキストの消去）・図・質問への回答・
// 圧縮前指示を混ぜる。Node・DOM に依存しない。テストからだけ使う
import type { ChatEvent, ChatEventType } from "@shared/types";
import { makeEvent, type EventInput } from "./factories";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL, visualIdLine } from "@shared/chat/aiVisual";
import { relayMessage } from "@shared/chat/prompts";

/** 種から決まる乱数（0 以上 1 未満。mulberry32） */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE = Date.parse("2026-11-01T00:00:00Z");

/** 記録を足していく道具（ID と時刻を順に振る） */
function recorder(chatId: number) {
  const events: ChatEvent[] = [];
  let id = 0;
  const add = <T extends ChatEventType>(type: T, data: EventInput<T>) => {
    id++;
    const e = makeEvent(id, type, data, { chat_id: chatId, created_at: new Date(BASE + id * 1000).toISOString() });
    events.push(e);
    return e;
  };
  return { events, add };
}

interface ScenarioOptions {
  /** ターンの数 */
  turns: number;
  /** 種 */
  seed: number;
  chatId?: number;
  /** 最後のターンを作業中のまま終える（result を付けない） */
  running?: boolean;
}

/**
 * ランダムに組み立てた長いチャット（種と turns で決まる）。1 ターンは自分の発言 → 動き（文・思考・ツール・サブエージェント・ToDo・図など）→ 作業の終わり
 */
export function scenarioChat({ turns, seed, chatId = 1, running = false }: ScenarioOptions): ChatEvent[] {
  const rnd = seededRandom(seed);
  const pickOf = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const chance = (p: number) => rnd() < p;
  const { events, add } = recorder(chatId);
  let call = 0;
  const callId = () => `c${++call}`;
  let session = 1;
  let taskNo = 0;
  const visuals: string[] = [];
  // 動いている・終わったサブエージェント（呼び出し ID・作業 ID・裏か）
  const agents: { key: string; task: string; background: boolean; done: boolean }[] = [];
  let todos: { content: string; status: string }[] = [];

  const tool = (name: string, input: unknown, opts: { parent?: string; content?: string; isError?: boolean } = {}) => {
    const id = callId();
    add("tool_use", { id, name, input, ...(opts.parent ? { parent: opts.parent } : {}) });
    add("tool_result", { tool_use_id: id, content: opts.content ?? "ok", is_error: opts.isError ?? false, ...(opts.parent ? { parent: opts.parent } : {}) });
    return id;
  };

  /** サブエージェントの中の手順（文・ツール・ToDo・ときどき入れ子・報告） */
  const inner = (parent: string, depth: number) => {
    const steps = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < steps; i++) {
      const r = rnd();
      if (r < 0.3) add("text", { text: `中の文 ${events.length}`, parent });
      else if (r < 0.4) add("thinking", { text: "", parent });
      else if (r < 0.5 && depth < 2) launch(parent, depth + 1);
      else if (r < 0.55) tool("TodoWrite", { todos: [{ content: "中の ToDo", status: "pending" }] }, { parent });
      else tool(pickOf(["Read", "Grep", "Bash"]), { file_path: `/a/${events.length}.ts`, command: "ls" }, { parent });
    }
    if (chance(0.3)) tool("SubagentHandback", { message: `報告 ${parent}` }, { parent });
  };

  /** サブエージェントを起動する（待つ形か裏で） */
  const launch = (parent: string | undefined, depth: number) => {
    const key = callId();
    const task = `t${key}`;
    const background = chance(0.4);
    const p = parent ? { parent } : {};
    // 乱数を 1 回引く（引く回数を変えると、同じ種でも決まったデータの長いチャットが変わる）
    rnd();
    add("tool_use", { id: key, name: "Agent", input: { description: `調査 ${key}`, subagent_type: "general", prompt: `依頼 ${key} の中身` }, ...p });
    add("subagent", { task_id: task, tool_use_id: key, description: `調査 ${key}`, status: "running" });
    if (chance(0.1)) add("tool_result", { tool_use_id: key, content: "Fork started — that fork is you.", parent: key });
    const agent = { key, task, background, done: false };
    agents.push(agent);
    if (background) {
      add("tool_result", { tool_use_id: key, content: `Async agent launched agentId: a${key}`, ...p });
      inner(key, depth);
      if (chance(0.6)) finish(agent);
    } else {
      inner(key, depth);
      finish(agent);
      const failed = chance(0.15);
      add("tool_result", {
        tool_use_id: key,
        content: failed ? pickOf(["API Error: Connection error.", "max_output_tokens exceeded"]) : `<tools-used-before-summary>x</tools-used-before-summary>The report follows:\n  結果 ${key}`,
        is_error: failed,
        ...p,
      });
    }
  };

  const finish = (agent: (typeof agents)[number]) => {
    if (agent.done) return;
    agent.done = true;
    const status = pickOf(["completed", "completed", "completed", "failed", "stopped"] as const);
    add("subagent", { task_id: agent.task, tool_use_id: agent.key, description: `調査 ${agent.key}`, status, summary: status === "failed" ? "API Error: Connection error." : `要約 ${agent.key}`, tokens: 100, tool_uses: 3 });
  };

  /** 止まった・終わったサブエージェントを SendMessage で再開する */
  const resume = () => {
    const agent = agents.length ? pickOf(agents) : undefined;
    if (!agent) return;
    const id = tool("SendMessage", { to: `a${agent.key}`, message: "続けて" });
    add("subagent", { task_id: agent.task, tool_use_id: id, description: `調査 ${agent.key}`, status: "running" });
    add("text", { text: "再開した回の文", parent: id });
    agent.done = false;
    if (chance(0.7)) finish(agent);
  };

  for (let t = 0; t < turns; t++) {
    const last = t === turns - 1;
    if (chance(0.05)) {
      add("context_cleared", {});
      session++;
    }
    const prompt = chance(0.05) ? { pre_compact: true as const } : {};
    add("user", { text: `指示 ${t} の文`, ...prompt, ...(chance(0.05) && agents.length ? { handover: [pickOf(agents).key] } : {}) });
    if (t === 0 || chance(0.1)) add("init", { session_id: `s${session}` });
    const steps = 2 + Math.floor(rnd() * 8);
    for (let i = 0; i < steps; i++) {
      const r = rnd();
      if (r < 0.2) add("text", { text: `返答 ${t}-${i} の文。長い文の代わり`.repeat(1 + Math.floor(rnd() * 3)) });
      else if (r < 0.27) add("thinking", { text: "", duration_ms: 1000 });
      else if (r < 0.37) launch(undefined, 0);
      else if (r < 0.41) resume();
      else if (r < 0.46) {
        // TodoWrite の書き直し（完了したものも消えることがある）
        todos = [...todos.filter(() => chance(0.6)).map((x) => ({ ...x, status: chance(0.5) ? "completed" : x.status })), { content: `やること ${t}-${i}`, status: "in_progress" }];
        tool("TodoWrite", { todos });
      } else if (r < 0.5) {
        taskNo++;
        tool("TaskCreate", { subject: `タスク ${taskNo}` }, { content: `Task #${taskNo} created successfully` });
      } else if (r < 0.53 && taskNo > 0) tool("TaskUpdate", { taskId: String(1 + Math.floor(rnd() * taskNo)), status: pickOf(["completed", "in_progress", "deleted"]) });
      else if (r < 0.56) {
        const vid = `v-${String(t).padStart(4, "0")}${String(i).padStart(4, "0")}`;
        const failed = chance(0.15);
        tool(AI_SHOW_VISUAL_TOOL, { kind: "svg", code: `<svg>${t}</svg>`, title: `図 ${t}` }, { content: failed ? "断りました" : `描きました\n${visualIdLine(vid)}`, isError: failed });
        if (!failed) visuals.push(vid);
      } else if (r < 0.58 && visuals.length) {
        const vid = pickOf(visuals);
        tool(AI_UPDATE_VISUAL_TOOL, { visual_id: vid, code: `<svg>u${t}</svg>` }, { content: `描き直しました\n${visualIdLine(vid)}` });
      } else if (r < 0.6) {
        add("approval_resolved", { approval_id: `q${t}${i}`, kind: "question", action: "answer", answers: { "どちら？": "A" } });
      } else if (r < 0.62 && agents.length) {
        // チャット欄からサブエージェントに伝えた指示（作業中に送った発言）
        const agent = pickOf(agents);
        add("user", { text: relayMessage(`a${agent.key}`, `調査 ${agent.key}`, "これも見て") });
      } else if (r < 0.64) add("user", { text: `作業中に伝えた発言 ${t}` });
      else if (r < 0.66) add("notice", { message: "お知らせ" });
      else if (r < 0.67) add("compact", { trigger: "auto", pre_tokens: 1000 });
      else tool(pickOf(["Read", "Bash", "Edit", "Grep"]), { file_path: `/repo/f${i}.ts`, command: "npm test", old_string: "a", new_string: "b" }, { content: "出力の行\n".repeat(3) });
    }
    if (running && last) break;
    const status = pickOf(["completed", "completed", "completed", "failed", "cancelled"] as const);
    if (status === "failed" && chance(0.3)) add("error", { message: "失敗しました" });
    add("result", { status, text: `返答の写し ${t}`, session_id: `s${session}`, ...(status === "failed" && chance(0.4) ? { network: true } : {}) });
  }
  return events;
}
