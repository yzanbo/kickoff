// チャットのタイムラインの組み立て（イベント → 表示の単位）
import type { ChatEvent } from "@shared/types";
import { changesOf, type EditCall, type FileChange } from "@/features/chat/tools/turnFileChanges";

export interface ToolCall {
  use: ChatEvent;
  result?: ChatEvent;
}

/**
 * 作業の終わり（result）に付けるもの。turnStart: その作業を始めた時刻（直前の自分の発言の時刻。作業時間を出すため）、
 * turnText: その作業での AI の返答をつないだ文（コピーのボタンに使う）、turnChanges: その作業で変えたファイル（ターンの変更カード）
 */
export type TimelineItem =
  | { kind: "event"; key: string; event: ChatEvent; turnStart?: string; turnText?: string; turnChanges?: FileChange[] }
  | { kind: "tools"; key: string; tools: ToolCall[] };

/**
 * 作業の終わりごとの変えたファイル（作業の終わりの記録 → 一覧）。終わった作業の編集はもう変わらないので覚えておき、
 * 返答が届くたびの組み立て直しで新しい配列を作らない（作業の終わりの行の memo が効くように）
 */
const turnChangesCache = new WeakMap<ChatEvent, FileChange[]>();

/** これより短い思考（中身なし）はタイムラインに出さない */
const THINKING_MIN_MS = 2000;

/**
 * 連続するツールの実行を 1 つのまとまりにする（結果は対応する呼び出しにぶら下げる）。
 * parent を渡すとそのサブエージェントの中身だけ、渡さなければ親のエージェントの分だけを並べる
 */
export function groupEvents(events: ChatEvent[], parent?: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const byId = new Map<string, ToolCall>();
  let turnStart: string | undefined;
  let turnTexts: string[] = [];
  // その作業の編集のツール（サブエージェントのものも含める。親の流れのときだけ数える）
  let turnEdits = new Map<string, EditCall>();
  for (const e of events) {
    if (parent === undefined) {
      const d = e.data as { id?: string; name?: string; tool_use_id?: string };
      if (e.type === "tool_use" && EDIT_TOOLS.has(d.name ?? "")) turnEdits.set(d.id!, { use: e });
      else if (e.type === "tool_result" && d.tool_use_id && turnEdits.has(d.tool_use_id)) turnEdits.get(d.tool_use_id)!.result = e;
    }
    if (((e.data as { parent?: string }).parent ?? undefined) !== parent) continue;
    if (e.type === "tool_use") {
      const call: ToolCall = { use: e };
      byId.set((e.data as { id: string }).id, call);
      const last = items[items.length - 1];
      if (last?.kind === "tools") last.tools.push(call);
      else items.push({ kind: "tools", key: `t${e.id}`, tools: [call] });
    } else if (e.type === "tool_result") {
      const call = byId.get((e.data as { tool_use_id: string }).tool_use_id);
      if (call) call.result = e;
    } else if (e.type === "thinking") {
      // 中身があるか、しばらく考えたものだけ出す（短い思考でツールのまとまりを細切れにしない）
      const { text, duration_ms } = e.data as { text?: string; duration_ms?: number };
      if (text?.trim() || (duration_ms ?? 0) >= THINKING_MIN_MS) items.push({ kind: "event", key: `e${e.id}`, event: e });
    } else if (e.type === "init" || e.type === "approval" || e.type === "subagent") {
      // 表示しない（サブエージェントはチャット欄の下の一覧で見せる）
    } else if (e.type === "result") {
      const turnText = turnTexts.join("\n\n");
      let turnChanges = turnChangesCache.get(e);
      if (!turnChanges) {
        turnChanges = changesOf([...turnEdits.values()]);
        turnChangesCache.set(e, turnChanges);
      }
      items.push({
        kind: "event",
        key: `e${e.id}`,
        event: e,
        ...(turnStart ? { turnStart } : {}),
        ...(turnText ? { turnText } : {}),
        ...(turnChanges.length ? { turnChanges } : {}),
      });
      turnStart = undefined;
      turnTexts = [];
      turnEdits = new Map();
    } else {
      if (e.type === "user") turnStart ??= e.created_at;
      if (e.type === "text") turnTexts.push(String((e.data as { text?: string }).text ?? ""));
      items.push({ kind: "event", key: `e${e.id}`, event: e });
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
    const { name, input = {} } = t.use.data as { name: string; input?: Record<string, unknown> };
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
