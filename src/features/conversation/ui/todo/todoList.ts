// チャットの ToDo（エージェントが TodoWrite / TaskCreate・TaskUpdate で付けた作業の一覧）
import type { ChatEvent } from "@shared/types";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  key: string;
  /** やること */
  content: string;
  /** 作業中の言い方（「テストを流しています」など。なければ content） */
  activeForm?: string;
  status: TodoStatus;
  /** 付けたときの作業を始めた自分の指示（記録の ID。指示より前なら null）。これまでの ToDo を指示ごとにまとめる */
  promptId: number | null;
  /** 最後に付けた・変えた記録の ID */
  touchedAt: number;
}

/** これまでの ToDo の 1 つのまとまり（同じ指示の作業で付けたもの） */
export interface TodoGroup {
  promptId: number | null;
  items: TodoItem[];
}

/**
 * チャットの ToDo を 3 つに分けたもの。
 * items = いまの作業（未完了と、いまの作業の中で完了したもの。ピルの数はこれだけで数える）/
 * stale = 前の作業から残っているもの（完了にならないまま、そのあと 2 回の作業で触られていない・前のセッションで完了しなかった。AI の付け忘れが多い）/
 * history = これまでの完了した ToDo（指示ごと。新しい指示が先）
 */
export interface TodoList {
  items: TodoItem[];
  stale: TodoItem[];
  history: TodoGroup[];
}

const asStatus = (value: unknown): TodoStatus => (value === "in_progress" || value === "completed" ? value : "pending");

/** 未完了のまま、付けた・変えた作業のあと、この回数の作業で触られていなければ「前の作業から残っているもの」にする */
const STALE_AFTER_RESULTS = 2;

/** いまの ToDo（collectTodoList のいまの作業だけ） */
export const collectTodos = (events: ChatEvent[]): TodoItem[] => collectTodoList(events).items;

/**
 * メインエージェントのツールの呼び出しから ToDo を組み立てる。
 * TodoWrite は毎回すべてを書き直す（最後のものが今の一覧。消えた完了済みはこれまでの ToDo に移す）。TaskCreate は 1 件ずつ足し（番号は結果の「Task #3」から）、
 * TaskUpdate は番号で状態を変える（deleted は消す）。TodoWrite と Task の両方があれば、後に使った方を今の一覧にする。
 * Claude Code のセッションが替わる（コンテキストの消去など）と番号は #1 から振り直されるので、それまでの分は締めて、新しい番号と混ぜない。
 * 作業の始まりは、作業の終わり（result）のあとの最初の自分の発言（作業中に伝えた発言は、同じ作業の続き）
 */
export function collectTodoList(events: readonly ChatEvent[]): TodoList {
  let written: TodoItem[] = [];
  const tasks = new Map<string, TodoItem>();
  const pendingCreate = new Map<string, { content: string; activeForm?: string }>();
  // 締めた分（前のセッション・書き直しで消えた完了済み・使わなくなった方の一覧）
  const closed: TodoItem[] = [];
  let last: "write" | "task" | null = null;
  let session: string | null = null;
  let epoch = 0;
  let serial = 0;
  let turnStart: number | null = null;
  let turnEnded = true;
  const results: number[] = [];

  const closeSession = () => {
    closed.push(...written, ...tasks.values());
    written = [];
    tasks.clear();
    pendingCreate.clear();
    last = null;
    epoch++;
  };

  for (const e of events) {
    if (e.type === "user") {
      if (turnEnded) turnStart = e.id;
      turnEnded = false;
      continue;
    }
    if (e.type === "result") {
      turnEnded = true;
      results.push(e.id);
      continue;
    }
    if (e.type === "context_cleared") {
      closeSession();
      session = null;
      continue;
    }
    if (e.type === "init") {
      if (session !== null && session !== e.data.session_id) closeSession();
      session = e.data.session_id;
      continue;
    }
    // サブエージェントの ToDo は数えない
    if (e.type === "tool_result") {
      if (e.data.parent || !pendingCreate.has(e.data.tool_use_id)) continue;
      const created = pendingCreate.get(e.data.tool_use_id)!;
      pendingCreate.delete(e.data.tool_use_id);
      const id = /Task #(\w+)/.exec(e.data.content)?.[1];
      if (!e.data.is_error && id) {
        tasks.set(id, { key: `s${epoch}t${id}`, ...created, status: "pending", promptId: turnStart, touchedAt: e.id });
        last = "task";
      }
      continue;
    }
    if (e.type !== "tool_use" || e.data.parent) continue;
    const { name } = e.data;
    const input = (e.data.input ?? {}) as Record<string, unknown>;
    if (name === "TodoWrite") {
      const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : [];
      const previous = [...written];
      written = todos.map((t) => {
        const content = String(t.content ?? "");
        const status = asStatus(t.status);
        // 前の一覧の同じ文のものを引き継ぐ（付けた指示・最後に変えた時を保つ）
        const index = previous.findIndex((p) => p.content === content);
        const prev = index === -1 ? undefined : previous.splice(index, 1)[0];
        return {
          key: prev?.key ?? `s${epoch}w${serial++}`,
          content,
          activeForm: typeof t.activeForm === "string" ? t.activeForm : undefined,
          status,
          promptId: prev?.promptId ?? turnStart,
          touchedAt: prev && prev.status === status ? prev.touchedAt : e.id,
        };
      });
      // 書き直しで消えたもの: 完了済みはこれまでの ToDo に残し、未完了は AI が外したものとして捨てる
      closed.push(...previous.filter((p) => p.status === "completed"));
      last = "write";
    } else if (name === "TaskCreate") {
      pendingCreate.set(e.data.id, {
        content: String(input.subject ?? input.description ?? ""),
        activeForm: typeof input.activeForm === "string" ? input.activeForm : undefined,
      });
    } else if (name === "TaskUpdate") {
      const id = String(input.taskId ?? "");
      const task = tasks.get(id);
      if (!task) continue;
      if (input.status === "deleted") tasks.delete(id);
      else {
        tasks.set(id, {
          ...task,
          ...(typeof input.subject === "string" ? { content: input.subject } : {}),
          ...(typeof input.activeForm === "string" ? { activeForm: input.activeForm } : {}),
          ...(input.status ? { status: asStatus(input.status) } : {}),
          touchedAt: e.id,
        });
      }
      last = "task";
    }
  }

  const live = last === "task" ? [...tasks.values()] : written;
  // 使わなくなった方の一覧（TodoWrite のあとで Task を使ったなど）も締める
  const unused = last === "task" ? written : [...tasks.values()];
  const items: TodoItem[] = [];
  const stale: TodoItem[] = [];
  const done: TodoItem[] = [];
  // 触ったあとに終わった作業の数（触った作業そのものの終わりは数えない）
  const endedSince = (at: number) => Math.max(0, results.filter((r) => r > at).length - 1);
  for (const t of [...closed, ...unused]) (t.status === "completed" ? done : stale).push(t);
  for (const t of live) {
    if (t.status === "completed") (t.touchedAt > (turnStart ?? -1) ? items : done).push(t);
    else (endedSince(t.touchedAt) >= STALE_AFTER_RESULTS ? stale : items).push(t);
  }
  return { items, stale, history: groupByPrompt(done) };
}

/** 指示ごとにまとめる（新しい指示が先。指示より前のものは最後。まとまりの中は付けた順） */
function groupByPrompt(items: readonly TodoItem[]): TodoGroup[] {
  const groups = new Map<number | null, TodoItem[]>();
  for (const t of items) groups.set(t.promptId, [...(groups.get(t.promptId) ?? []), t]);
  return [...groups.entries()].map(([promptId, list]) => ({ promptId, items: list })).sort((a, b) => (b.promptId ?? -1) - (a.promptId ?? -1));
}

/** 一覧の中身の印（手で隠した一覧と同じかを見分ける。中身・状態が変わったら別の印になり、また出す） */
export const todoSignature = (items: readonly TodoItem[]): string => items.map((t) => `${t.key}\t${t.status}\t${t.content}`).join("\n");

/**
 * ToDo のピルの出し方: full = ふつう / done = いまの作業がすべて完了（控えめに）/ hidden = 出さない。
 * いまの作業がない（すべて完了したあとに自分が次の指示を送ると、前の作業の分はこれまでの ToDo に移る）・手で隠した一覧のまま（hidden が今の印と同じ）なら出さない。
 * 前の作業から残っているもの・これまでの ToDo だけでは出さない（いまの作業があるときに一覧の下で見る）
 */
export function todoVisibility(list: TodoList, hidden: string): "full" | "done" | "hidden" {
  if (list.items.length === 0) return "hidden";
  if (hidden !== "" && hidden === todoSignature(list.items)) return "hidden";
  return list.items.every((t) => t.status === "completed") ? "done" : "full";
}
