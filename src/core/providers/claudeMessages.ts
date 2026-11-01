import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderCallbacks } from "./types.js";

const TOOL_RESULT_LIMIT = 4000;

/** SDK のメッセージを Kickoff のイベントに変換する。init のときはセッション ID を返す */
export function emitSdkMessage(msg: SDKMessage, cb: ProviderCallbacks): string | undefined {
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        cb.emit({ type: "init", session_id: msg.session_id, model: msg.model, permission_mode: msg.permissionMode });
        return msg.session_id;
      }
      // 会話の要約（手で圧縮したとき・上限に近づいて自動で圧縮されたとき）
      if (msg.subtype === "compact_boundary") {
        const { trigger, pre_tokens, post_tokens } = msg.compact_metadata;
        cb.emit({ type: "compact", trigger, pre_tokens, ...(post_tokens !== undefined ? { post_tokens } : {}) });
        return undefined;
      }
      // サブエージェント: 開始と終了は記録し、途中経過（トークン数・直近のツール）は画面にだけ流す
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
      const sub = parent ? { sub: true, parent } : {};
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          cb.emit({ type: "text", text: block.text, ...sub });
        } else if (block.type === "tool_use") {
          cb.emit({ type: "tool_use", id: block.id, name: block.name, input: block.input, ...sub });
        } else if (block.type === "thinking" && block.thinking.trim()) {
          cb.emit({ type: "thinking", text: block.thinking });
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

    case "stream_event":
      // メインのエージェントの文章だけを流す（サブエージェントの途中経過は出さない）
      if (
        msg.parent_tool_use_id === null &&
        msg.event.type === "content_block_delta" &&
        msg.event.delta.type === "text_delta"
      ) {
        cb.stream?.(msg.event.delta.text);
      }
      return undefined;

    default:
      return undefined;
  }
}
