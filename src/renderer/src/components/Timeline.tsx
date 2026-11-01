import { ChevronRight, Wrench } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { Attachment, RunEvent } from "../../../core/types";
import { cx } from "../cx";
import { cleanSubagentReport, isSubagentTool } from "../subagents";
import { toolLabel, type TimelineItem, type ToolCall } from "../timeline";
import { describeToolInput } from "./ApprovalCard";
import { AttachmentChip } from "./AttachmentChip";
import { Markdown } from "./Markdown";

/** タイムラインの Task / Agent の呼び出しから、そのサブエージェントの中身を開く */
export const OpenSubagentContext = createContext<(toolUseId: string) => void>(() => {});

/**
 * タイムライン（発言とツールのまとまり）。rel はリポジトリの絶対パスを相対パスにする。
 * active なら、最後のツールのまとまりを実行中として見せる
 */
export function TimelineItems({ items, rel, active }: { items: TimelineItem[]; rel: (s: string) => string; active: boolean }) {
  return items.map((item, i) =>
    item.kind === "tools" ? (
      <ToolGroup key={item.key} tools={item.tools} rel={rel} active={active && i === items.length - 1} />
    ) : (
      <EventItem key={item.key} event={item.event} />
    ),
  );
}

/** 「考えています」などの、エージェントが動いている印 */
export function Working({ children }: { children: ReactNode }) {
  return (
    <div className="working">
      <span className="dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {children}
    </div>
  );
}

/** ツールのまとまり（閉じた状態では「読む ×2・編集」のように要約する） */
function ToolGroup({ tools, rel, active }: { tools: ToolCall[]; rel: (s: string) => string; active: boolean }) {
  const counts = new Map<string, number>();
  for (const t of tools) {
    const label = toolLabel((t.use.data as { name: string }).name);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join("・");
  const failed = tools.filter((t) => (t.result?.data as { is_error?: boolean } | undefined)?.is_error).length;
  const last = tools[tools.length - 1];
  const lastData = last.use.data as { name: string; input?: Record<string, unknown> };
  const running = active && !last.result;

  return (
    <details
      className={cx("tool-group", failed > 0 && "has-error", running && "active")}
      // サブエージェントの一覧から、その呼び出しを含むまとまりへ移れるようにする
      data-tool-ids={tools.map((t) => t.use.id).join(" ")}
    >
      <summary>
        <ChevronRight size={14} className="tool-chevron" />
        <Wrench size={13} className="muted" />
        <span className="tool-summary">{summary}</span>
        {running ? (
          <span className="tool-current">{rel(describeToolInput(lastData.name, lastData.input ?? {}))}</span>
        ) : (
          failed > 0 && <span className="tool-failed">{failed} 件失敗</span>
        )}
      </summary>
      <div className="tool-calls">
        {tools.map((t) => (
          <ToolItem key={t.use.id} call={t} rel={rel} />
        ))}
      </div>
    </details>
  );
}

/** ツールの呼び出し 1 件（開くと編集内容・結果を出す） */
function ToolItem({ call, rel }: { call: ToolCall; rel: (s: string) => string }) {
  const { id, name, input = {} } = call.use.data as { id: string; name: string; input?: Record<string, unknown> };
  const openSubagent = useContext(OpenSubagentContext);
  const r = call.result?.data as { content?: string; is_error?: boolean } | undefined;
  let detail: ReactNode = null;
  if ((name === "Edit" || name === "MultiEdit") && typeof input.old_string === "string") {
    detail = <Diff before={input.old_string} after={String(input.new_string ?? "")} />;
  } else if (name === "Write" && typeof input.content === "string") {
    detail = <Diff before="" after={input.content} maxLines={40} />;
  }
  return (
    <details className={cx("tool-call", r?.is_error && "error")}>
      <summary>
        <span className="tool-name">{toolLabel(name)}</span>
        <span className="tool-arg">{rel(describeToolInput(name, input))}</span>
        {!call.result && <span className="spinner small" aria-label="実行中" />}
        {isSubagentTool(name) && (
          <button
            type="button"
            className="tool-open-sub"
            onClick={(e) => {
              e.preventDefault();
              openSubagent(id);
            }}
          >
            中身を見る
          </button>
        )}
      </summary>
      {detail}
      {r?.content && (r.is_error || !detail) && (
        <pre className={cx("tool-output", r.is_error && "error")}>
          {/* サブエージェントの結果は、Claude Code の前置きを外して報告の本文だけを見せる */}
          {rel(isSubagentTool(name) ? cleanSubagentReport(r.content) : r.content)}
        </pre>
      )}
    </details>
  );
}

/** 編集内容の表示（削除した行を赤、追加した行を緑で） */
function Diff({ before, after, maxLines = 200 }: { before: string; after: string; maxLines?: number }) {
  const lines = [...(before ? before.split("\n").map((l) => ["-", l] as const) : []), ...after.split("\n").map((l) => ["+", l] as const)];
  const shown = lines.slice(0, maxLines);
  return (
    <pre className="diff">
      {shown.map(([sign, line], i) => (
        <span key={i} className={sign === "+" ? "diff-add" : "diff-del"}>
          {sign} {line}
          {"\n"}
        </span>
      ))}
      {lines.length > shown.length && <span className="muted">… ほか {lines.length - shown.length} 行</span>}
    </pre>
  );
}

const RESOLVED_LABELS: Record<string, string> = {
  allow: "許可しました",
  allow_always: "常に許可しました",
  deny: "拒否しました",
  answer: "質問に回答しました",
};

/** 発言・お知らせ 1 件 */
function EventItem({ event }: { event: RunEvent }) {
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case "user": {
      const attachments = (data.attachments as Attachment[] | undefined) ?? [];
      return (
        <div className="bubble user" id={`ev-${event.id}`}>
          {attachments.length > 0 && (
            <div className="bubble-attachments">
              {attachments.map((a) => (
                <AttachmentChip key={a.id} attachment={a} />
              ))}
            </div>
          )}
          {String(data.text ?? "")}
        </div>
      );
    }
    case "text":
      return (
        <div className={cx("assistant", Boolean(data.sub) && "sub")} id={`ev-${event.id}`}>
          <Markdown>{String(data.text)}</Markdown>
        </div>
      );
    case "approval_resolved":
      return <div className="event-note">{RESOLVED_LABELS[String(data.action)] ?? "回答済み"}</div>;
    case "result":
      if (data.status === "completed") return null;
      return (
        <div className={cx("event-note", data.status === "failed" && "error")}>
          {data.status === "cancelled" ? "中断しました" : `失敗しました: ${String(data.text ?? "")}`}
        </div>
      );
    case "error":
      return <div className="event-note error">{String(data.message)}</div>;
    case "notice":
      return <div className="event-note">{String(data.message)}</div>;
    default:
      return null;
  }
}
