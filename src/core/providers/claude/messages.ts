import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderCallbacks } from "../types.js";

const TOOL_RESULT_LIMIT = 4000;

/**
 * 1 回の実行の間だけ持つ、メッセージの変換の状態。
 * 思考の時間（メインのエージェントの分だけ）: 思考のブロックは、流れてくる途中経過（stream_event）で始まりと終わりが分かり、
 * 中身は後から届く assistant に入る。
 * サブエージェントでないタスク（裏のコマンドなど）: 途中経過・終了の知らせには種類が入らないので、始まりで覚えておいて除く
 */
export interface MessageState {
  /** サブエージェント（local_agent）でないタスクの ID */
  otherTasks: Set<string>;
  /** 思考のブロックを始めた時刻（ブロックの番号ごと） */
  starts: Map<number, number>;
  /** 終わった思考のかかった時間（届いた順。assistant の思考のブロックに順に割り当てる） */
  durations: number[];
  /** 会話を圧縮している最中か（Claude Code の status の知らせ） */
  compacting: boolean;
}

export const createMessageState = (): MessageState => ({ otherTasks: new Set(), starts: new Map(), durations: [], compacting: false });

/** 圧縮している最中かが変わったときだけ知らせる */
function setCompacting(state: MessageState, cb: ProviderCallbacks, active: boolean) {
  if (state.compacting === active) return;
  state.compacting = active;
  cb.compacting?.(active);
}

/** 次の思考のかかった時間（終わりの知らせより先に中身が届いたら、まだ終わっていない最初の思考の始まりから数える） */
function takeThinkingDuration(state: MessageState, now: number): number | undefined {
  const done = state.durations.shift();
  if (done !== undefined) return done;
  const first = [...state.starts.keys()].sort((a, b) => a - b)[0];
  if (first === undefined) return undefined;
  const start = state.starts.get(first)!;
  state.starts.delete(first);
  return now - start;
}

/** SDK のメッセージを Kickoff のイベントに変換する。init のときはセッション ID を返す */
export function emitSdkMessage(msg: SDKMessage, cb: ProviderCallbacks, state: MessageState = createMessageState(), now = Date.now()): string | undefined {
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        // effort: 実際に使う推論の深さ（設定・モデルの既定を通したあとの値。CLI が知らせるときだけ）
        const effort = (msg as { effort?: string | null }).effort;
        cb.emit({ type: "init", session_id: msg.session_id, model: msg.model, permission_mode: msg.permissionMode, ...(effort !== undefined ? { effort } : {}) });
        return msg.session_id;
      }
      // 会話の要約（手で圧縮したとき・上限に近づいて自動で圧縮されたとき）
      if (msg.subtype === "compact_boundary") {
        const { trigger, pre_tokens, post_tokens, duration_ms } = msg.compact_metadata;
        setCompacting(state, cb, false);
        cb.emit({
          type: "compact",
          trigger,
          pre_tokens,
          ...(post_tokens !== undefined ? { post_tokens } : {}),
          ...(duration_ms !== undefined ? { duration_ms } : {}),
        });
        return undefined;
      }
      // いまの段階（圧縮中・API に問い合わせ中）。圧縮の始まりと終わりを画面に知らせ、失敗したら理由を渡す（お知らせに残すかはコアが決める）
      if (msg.subtype === "status") {
        setCompacting(state, cb, msg.status === "compacting");
        if (msg.compact_result === "failed") cb.compactFailed?.(msg.compact_error ?? null);
        return undefined;
      }
      // サブエージェント: 開始と終了は記録し、途中経過（トークン数・直近のツール）は画面にだけ流す。
      // タスクには裏のコマンド（local_bash）なども入るので、サブエージェント（local_agent。種類のない古い CLI も）だけにする
      if (msg.subtype === "task_started" && msg.task_type && msg.task_type !== "local_agent") {
        state.otherTasks.add(msg.task_id);
        return undefined;
      }
      if ("task_id" in msg && typeof msg.task_id === "string" && state.otherTasks.has(msg.task_id)) return undefined;
      if (msg.subtype === "task_started") {
        cb.emit({
          type: "subagent",
          task_id: msg.task_id,
          tool_use_id: msg.tool_use_id,
          description: msg.description,
          subagent_type: msg.subagent_type,
          status: "running",
        });
      } else if (msg.subtype === "task_progress") {
        cb.subagentProgress?.({
          task_id: msg.task_id,
          tool_use_id: msg.tool_use_id,
          description: msg.description,
          subagent_type: msg.subagent_type,
          status: "running",
          tokens: msg.usage.total_tokens,
          tool_uses: msg.usage.tool_uses,
          duration_ms: msg.usage.duration_ms,
          last_tool: msg.last_tool_name,
        });
      } else if (msg.subtype === "task_notification") {
        cb.emit({
          type: "subagent",
          task_id: msg.task_id,
          tool_use_id: msg.tool_use_id,
          description: "",
          status: msg.status,
          tokens: msg.usage?.total_tokens,
          tool_uses: msg.usage?.tool_uses,
          duration_ms: msg.usage?.duration_ms,
          summary: msg.summary,
        });
      }
      return undefined;

    case "assistant": {
      // サブエージェントの発言は、どのサブエージェントのものかを残す（画面でその中身を見られるように）
      const parent = msg.parent_tool_use_id ?? undefined;
      const sub = parent ? { parent } : {};
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          cb.emit({ type: "text", text: block.text, ...sub });
        } else if (block.type === "tool_use") {
          cb.emit({ type: "tool_use", id: block.id, name: block.name, input: block.input, ...sub });
        } else if (block.type === "thinking" || block.type === "redacted_thinking") {
          // 中身が空（既定では思考の中身を返さない）でも、かかった時間が分かれば残す
          const text = block.type === "thinking" ? block.thinking.trim() : "";
          const duration = parent ? undefined : takeThinkingDuration(state, now);
          if (text || duration !== undefined) {
            cb.emit({ type: "thinking", text, ...(duration !== undefined ? { duration_ms: duration } : {}), ...sub });
          }
        }
      }
      return undefined;
    }

    case "user": {
      const content = msg.message.content;
      if (typeof content === "string") return undefined;
      for (const block of content) {
        if (block.type !== "tool_result") continue;
        const text =
          typeof block.content === "string"
            ? block.content
            : (block.content ?? [])
                .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
                .join("\n");
        cb.emit({
          type: "tool_result",
          tool_use_id: block.tool_use_id,
          content: text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}\n…（省略）` : text,
          is_error: Boolean(block.is_error),
          ...(msg.parent_tool_use_id ? { parent: msg.parent_tool_use_id } : {}),
        });
      }
      return undefined;
    }

    case "stream_event": {
      // メインのエージェントの文章だけを流す（サブエージェントの途中経過は出さない）
      if (msg.parent_tool_use_id !== null) return undefined;
      const event = msg.event;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        cb.stream?.(event.delta.text);
      } else if (event.type === "content_block_start" && (event.content_block.type === "thinking" || event.content_block.type === "redacted_thinking")) {
        state.starts.set(event.index, now);
      } else if (event.type === "content_block_stop" && state.starts.has(event.index)) {
        state.durations.push(now - state.starts.get(event.index)!);
        state.starts.delete(event.index);
      }
      return undefined;
    }

    default:
      return undefined;
  }
}
