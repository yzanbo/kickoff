// チャットのタイムラインの組み立て（イベント → 表示の単位）
import type { ChatEvent, ChatEventOf } from "@shared/types";
import { isBackgroundLaunch } from "@shared/chat/backgroundTasks";
import { isSubagentTool } from "@shared/chat/subagents";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL } from "@shared/chat/aiVisual";
import { lastReplyBefore } from "@shared/chat/handoff";
import { createdChatIdOf, isCreateChatTool, relationOf } from "@shared/chat/aiCreateChat";
import { changesOf, type EditCall, type FileChange } from "@/features/chat/tools/turnFileChanges";

export interface ToolCall {
  use: ChatEventOf<"tool_use">;
  result?: ChatEventOf<"tool_result">;
}

/**
 * 作業の終わり（result）に付けるもの。turnStart: その作業を始めた時刻（直前の自分の発言の時刻。作業時間を出すため）、
 * turnText: その作業での AI の返答をつないだ文（コピーのボタンに使う）、turnChanges: その作業で変えたファイル（ターンの変更カード）、
 * turnHandoff: 親チャットに渡すもの（子チャットの「親チャットに追加」）、turnHandoffs: その作業の返答を親チャットに渡した記録（渡した順。渡したことの印）。
 * 自分の発言に付けるもの。createdChats: その発言の作業で AI が create_chat で作った兄弟チャット・親のないチャットの ID（「,」でつなぐ。発言の下に子チャットと同じ札を出す。
 * 子チャットは parent_event_id で札が出るので入れない。文字にするのは、記録が増えるたびの組み立て直しでも値で比べて memo が効くように）
 */
export type TimelineItem =
  | {
      kind: "event";
      key: string;
      event: ChatEvent;
      turnStart?: string;
      turnText?: string;
      turnChanges?: FileChange[];
      turnHandoff?: TurnHandoff;
      turnHandoffs?: ChatEventOf<"handoff">[];
      createdChats?: string;
    }
  | { kind: "tools"; key: string; tools: ToolCall[] }
  /** サブエージェントの起動（Agent / Task の呼び出し。ツールのまとまりに入れず、流れの中のカードにする） */
  | { kind: "subagent"; key: string; call: ToolCall }
  /** AI が返答の中に描いた図・描き直し（show_visual / update_visual。ツールのまとまりに入れず、文の間に図として出す） */
  | { kind: "visual"; key: string; call: ToolCall }
  /** 裏で動かしたサブエージェントが終わった（その時刻の位置に 1 行。agentKey は一覧の行のキー = 起動した呼び出し ID） */
  | { kind: "subagentEnd"; key: string; event: ChatEventOf<"subagent">; agentKey: string };

/**
 * 作業の終わりごとの変えたファイル（作業の終わりの記録 → 一覧）。終わった作業の編集はもう変わらないので覚えておき、
 * 返答が届くたびの組み立て直しで新しい配列を作らない（作業の終わりの行の memo が効くように）
 */
const turnChangesCache = new WeakMap<ChatEvent, FileChange[]>();

/**
 * 作業の終わりの、親チャットに渡すもの。reply: その作業の最後の返答（途中の「確認します」・サブエージェントの文は入れない。lastReplyBefore）、
 * requested: 親への依頼文を頼んだ作業か（頼みの発言 handoff_request に答えた作業。渡すボタンを目立たせる）
 */
export interface TurnHandoff {
  reply: string;
  requested: boolean;
}

/** 作業の終わりごとの渡すもの（終わった作業はもう変わらないので覚え、memo した終わりの行に同じものを渡す。返答がなければ null） */
const turnHandoffCache = new WeakMap<ChatEvent, TurnHandoff | null>();

/** 作業の終わりごとの渡した記録（新しく渡すまでは同じ配列を渡し、memo した終わりの行を描き直させない） */
const turnHandoffsCache = new WeakMap<ChatEvent, ChatEventOf<"handoff">[]>();

/** 渡した記録を作業の終わりの記録の ID ごとに（渡した記録は作業の終わりより後ろに付くので、先にまとめる） */
function handoffsByTurn(events: readonly ChatEvent[]): Map<number, ChatEventOf<"handoff">[]> {
  const byTurn = new Map<number, ChatEventOf<"handoff">[]>();
  for (const e of events) {
    if (e.type !== "handoff") continue;
    const list = byTurn.get(e.data.turn_event_id);
    if (list) list.push(e);
    else byTurn.set(e.data.turn_event_id, [e]);
  }
  return byTurn;
}

/** 前に渡した配列と同じ中身なら前のものを使う */
function cachedHandoffs(end: ChatEvent, list: ChatEventOf<"handoff">[] | undefined): ChatEventOf<"handoff">[] | undefined {
  if (!list) return undefined;
  const prev = turnHandoffsCache.get(end);
  if (prev && prev.length === list.length && prev.at(-1) === list.at(-1)) return prev;
  turnHandoffsCache.set(end, list);
  return list;
}

/** サブエージェントの中の記録なら、そのサブエージェントを起動した呼び出し ID（メインの記録・parent のない種類は undefined） */
const parentOf = (e: ChatEvent): string | undefined => ("parent" in e.data ? e.data.parent : undefined);

/** これより短い思考（中身なし）はタイムラインに出さない */
const THINKING_MIN_MS = 2000;

/**
 * 連続するツールの実行を 1 つのまとまりにする（結果は対応する呼び出しにぶら下げる）。サブエージェントの起動は、まとまりに入れずカードの項目にする。
 * scope を渡すとそのサブエージェントの中身だけ（行のキーと、再開した回の呼び出し ID。SubagentEntry の key と aliases）、
 * 渡さなければメインエージェントの分だけを並べる
 */
/**
 * 自分の発言ごとの、その作業で AI が create_chat で作った兄弟チャット・親のないチャット（メインの流れの呼び出しで、作れたものだけ。発言の記録の ID → チャットの ID の列）。
 * 子チャットは聞いた位置（parent_event_id）で発言の下に札が出るので除く
 */
export function createdChatsByUser(events: ChatEvent[]): Map<number, number[]> {
  const created = new Map<number, number[]>();
  const callOwner = new Map<string, number>();
  let lastUser: number | null = null;
  for (const e of events) {
    if (e.type === "user") lastUser = e.id;
    else if (e.type === "tool_use" && e.data.parent === undefined && lastUser !== null && isCreateChatTool(e.data.name)) {
      const input = e.data.input && typeof e.data.input === "object" ? (e.data.input as Record<string, unknown>) : {};
      if (relationOf(input) !== "child") callOwner.set(e.data.id, lastUser);
    } else if (e.type === "tool_result" && !e.data.is_error && callOwner.has(e.data.tool_use_id)) {
      const id = createdChatIdOf(e.data.content);
      const owner = callOwner.get(e.data.tool_use_id)!;
      if (id !== null) created.set(owner, [...(created.get(owner) ?? []), id]);
    }
  }
  return created;
}

export function groupEvents(events: ChatEvent[], scope?: readonly string[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const byId = new Map<string, ToolCall>();
  const inScope = (parent: string | undefined) => (scope === undefined ? parent === undefined : parent !== undefined && scope.includes(parent));
  // サブエージェントの起動: どの流れで起動したか（その流れに終わりの 1 行を出す）・裏で動かしたか・作業 ID → 起動した呼び出し ID
  const launchedHere = new Set<string>();
  const backgrounded = new Set<string>();
  const agentOfTask = new Map<string, string>();
  let turnStart: string | undefined;
  let turnTexts: string[] = [];
  // その作業に、親への依頼文の頼みの発言があったか
  let turnRequested = false;
  // その作業の編集のツール（サブエージェントのものも含める。親の流れのときだけ数える）
  let turnEdits = new Map<string, EditCall>();
  // 親チャットに渡した記録（メインの流れのときだけ。作業の終わりの行に印を出す）
  const handoffs = scope === undefined ? handoffsByTurn(events) : new Map<number, ChatEventOf<"handoff">[]>();
  // AI が作った兄弟チャット・親のないチャット（メインの流れのときだけ。発言の下に札を出す）
  const created = scope === undefined ? createdChatsByUser(events) : new Map<number, number[]>();
  for (const [index, e] of events.entries()) {
    if (scope === undefined) {
      if (e.type === "tool_use" && EDIT_TOOLS.has(e.data.name)) turnEdits.set(e.data.id, { use: e });
      else if (e.type === "tool_result" && turnEdits.has(e.data.tool_use_id)) turnEdits.get(e.data.tool_use_id)!.result = e;
    }
    // サブエージェントの知らせ（parent を持たない）: 裏で動かしたものが終わったら、起動した流れに 1 行
    if (e.type === "subagent") {
      const d = e.data;
      const agentKey = agentOfTask.get(d.task_id) ?? d.tool_use_id;
      if (agentKey === undefined) continue;
      if (d.tool_use_id === agentKey) agentOfTask.set(d.task_id, agentKey);
      // 再開した回（呼び出し ID が SendMessage のもの）は、いつも裏で動く
      else if (d.tool_use_id !== undefined) backgrounded.add(agentKey);
      if (d.status !== "running" && backgrounded.has(agentKey) && launchedHere.has(agentKey)) items.push({ kind: "subagentEnd", key: `x${e.id}`, event: e, agentKey });
      continue;
    }
    // 裏で動かしたサブエージェント（結果が「起動した」という知らせ）。どの流れの記録でも数える
    if (e.type === "tool_result" && isBackgroundLaunch(e.data.content)) backgrounded.add(e.data.tool_use_id);
    if (!inScope(parentOf(e))) continue;
    if (e.type === "tool_use") {
      const call: ToolCall = { use: e };
      byId.set(e.data.id, call);
      if (isSubagentTool(e.data.name)) {
        launchedHere.add(e.data.id);
        items.push({ kind: "subagent", key: `s${e.id}`, call });
        continue;
      }
      if (e.data.name === AI_SHOW_VISUAL_TOOL || e.data.name === AI_UPDATE_VISUAL_TOOL) {
        items.push({ kind: "visual", key: `v${e.id}`, call });
        continue;
      }
      const last = items[items.length - 1];
      if (last?.kind === "tools") last.tools.push(call);
      else items.push({ kind: "tools", key: `t${e.id}`, tools: [call] });
    } else if (e.type === "tool_result") {
      const call = byId.get(e.data.tool_use_id);
      if (call) call.result = e;
    } else if (e.type === "thinking") {
      // 中身があるか、しばらく考えたものだけ出す（短い思考でツールのまとまりを細切れにしない）
      const { text, duration_ms } = e.data;
      if (text.trim() || (duration_ms ?? 0) >= THINKING_MIN_MS) items.push({ kind: "event", key: `e${e.id}`, event: e });
    } else if (e.type === "init" || e.type === "approval" || e.type === "handoff") {
      // 表示しない
    } else if (e.type === "result") {
      const turnText = turnTexts.join("\n\n");
      let turnChanges = turnChangesCache.get(e);
      if (!turnChanges) {
        turnChanges = changesOf([...turnEdits.values()]);
        turnChangesCache.set(e, turnChanges);
      }
      const turnHandoffs = cachedHandoffs(e, handoffs.get(e.id));
      let turnHandoff = turnHandoffCache.get(e);
      if (turnHandoff === undefined) {
        const reply = lastReplyBefore(events, index);
        turnHandoff = reply === null ? null : { reply, requested: turnRequested };
        turnHandoffCache.set(e, turnHandoff);
      }
      items.push({
        kind: "event",
        key: `e${e.id}`,
        event: e,
        ...(turnStart ? { turnStart } : {}),
        ...(turnText ? { turnText } : {}),
        ...(turnChanges.length ? { turnChanges } : {}),
        ...(turnHandoff ? { turnHandoff } : {}),
        ...(turnHandoffs ? { turnHandoffs } : {}),
      });

      turnStart = undefined;
      turnTexts = [];
      turnRequested = false;
      turnEdits = new Map();
    } else {
      if (e.type === "user") {
        turnStart ??= e.created_at;
        if (e.data.handoff_request) turnRequested = true;
      }
      if (e.type === "text") turnTexts.push(e.data.text);
      const createdChats = e.type === "user" ? created.get(e.id)?.join(",") : undefined;
      items.push({ kind: "event", key: `e${e.id}`, event: e, ...(createdChats ? { createdChats } : {}) });
    }
  }
  return items;
}

export const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
/** 回数で数えるツールの種類（並びは要約に出す順。先頭のコマンドの次に、ファイルの読み取りを挟む） */
const COUNTED_KINDS = [
  { tools: ["Bash"], text: (n: number) => `${n}個のコマンドを実行` },
  { tools: ["Grep", "Glob", "WebSearch"], text: (n: number) => `${n}回検索` },
  { tools: ["WebFetch"], text: (n: number) => `${n}件のページを取得` },
  { tools: ["TaskCreate"], text: (n: number) => `ToDo を${n}件追加` },
  { tools: ["TaskUpdate", "TodoWrite"], text: (n: number) => `ToDo を${n}件更新` },
  { tools: ["TaskList", "TaskGet"], text: (n: number) => `ToDo を${n}回確認` },
  { tools: ["ToolSearch"], text: (n: number) => `ツールを${n}回検索` },
  { tools: ["Skill"], text: (n: number) => `スキルを${n}回使用` },
  { tools: ["Agent", "Task"], text: (n: number) => `サブエージェントを${n}件起動` },
  { tools: ["SendMessage"], text: (n: number) => `メッセージを${n}件送信` },
  { tools: ["TaskOutput", "BashOutput", "Monitor"], text: (n: number) => `作業の様子を${n}回確認` },
  { tools: ["TaskStop", "KillShell", "KillBash"], text: (n: number) => `作業を${n}件停止` },
  { tools: ["AskUserQuestion"], text: (n: number) => `${n}件の質問` },
  { tools: ["ExitPlanMode"], text: (n: number) => `計画を${n}回提示` },
];
const KIND_OF = new Map(COUNTED_KINDS.flatMap((kind, i) => kind.tools.map((name) => [name, i] as const)));

/**
 * ツールのまとまりで何をしたかを 1 文にする（「2個のファイルを編集 および 3個のコマンドを実行」）。
 * 編集・読み取りはファイルの数、それ以外は種類ごとの回数で数える（分類できないものだけ「その他」）
 */
export function summarizeTools(tools: ToolCall[]): string {
  const edited = new Set<string>();
  const read = new Set<string>();
  const counts = COUNTED_KINDS.map(() => 0);
  let kickoff = 0;
  let mcp = 0;
  let others = 0;
  for (const t of tools) {
    const name = t.use.data.name;
    const input = (t.use.data.input ?? {}) as Record<string, unknown>;
    const file = String(input.file_path ?? input.notebook_path ?? t.use.id);
    const kind = KIND_OF.get(name);
    if (EDIT_TOOLS.has(name)) edited.add(file);
    else if (name === "Read") read.add(file);
    else if (kind !== undefined) counts[kind] += 1;
    else if (name.startsWith("mcp__kickoff__")) kickoff += 1;
    else if (name.startsWith("mcp__")) mcp += 1;
    else others += 1;
  }
  const [commands, ...rest] = COUNTED_KINDS.map((kind, i) => (counts[i] > 0 ? kind.text(counts[i]) : ""));
  const parts = [
    edited.size > 0 && `${edited.size}個のファイルを編集`,
    commands,
    read.size > 0 && `${read.size}個のファイルを読み取り`,
    ...rest,
    kickoff > 0 && `Kickoff を${kickoff}回使用`,
    mcp > 0 && `MCP のツールを${mcp}回使用`,
    others > 0 && `その他のツールを${others}回使用`,
  ].filter((part): part is string => Boolean(part));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join("、")} および ${parts[parts.length - 1]}`;
}

/**
 * 表示用にリポジトリの絶対パスを相対パスにする（`repo/` を外し、リポジトリそのものは「.」）。
 * `repo-worktrees/...` のように、リポジトリの名前に文字が続く別のパスは変えない
 */
export function relativize(text: string, repo: string): string {
  if (!repo) return text;
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}/|${escaped}(?![\\w.-])`, "g"), (m) => (m.endsWith("/") ? "" : "."));
}
