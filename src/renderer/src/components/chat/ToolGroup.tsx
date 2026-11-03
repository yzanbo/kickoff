import { ChevronRight, Wrench } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { cx } from "../../cx";
import { BashOutput } from "./BashOutput";
import { cleanSubagentReport, isSubagentTool } from "./subagentList";
import { summarizeTools, type ToolCall } from "./timelineItems";
import { describeTool, describeToolInput, toolLabel, visibleToolResult } from "./toolDescribe";

/** タイムラインの Task / Agent の呼び出しから、そのサブエージェントの中身を開く */
export const OpenSubagentContext = createContext<(toolUseId: string) => void>(() => {});

/** ツールのまとまり（閉じた状態では「2個のファイルを編集 および 3個のコマンドを実行」のように要約する） */
export function ToolGroup({ tools, rel, active }: { tools: ToolCall[]; rel: (s: string) => string; active: boolean }) {
  const summary = summarizeTools(tools);
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
          <span className="tool-current">{rel(describeTool(lastData.name, lastData.input ?? {}))}</span>
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
  // ツール検索の `[tool_reference]` のような意味のない結果は出さない
  const content = r?.content ? visibleToolResult(r.content) : "";
  let detail: ReactNode = null;
  // コマンドは、コマンドと出力（失敗の知らせも）を 1 つの枠で出すので、下の結果の欄は使わない
  const isCommand = name === "Bash" && typeof input.command === "string";
  if (isCommand) {
    detail = <BashOutput command={String(input.command)} result={r} rel={rel} />;
  } else if ((name === "Edit" || name === "MultiEdit") && typeof input.old_string === "string") {
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
      {content && !isCommand && (r?.is_error || !detail) && (
        <pre className={cx("tool-output", r?.is_error && "error")}>
          {/* サブエージェントの結果は、Claude Code の前置きを外して報告の本文だけを見せる */}
          {rel(isSubagentTool(name) ? cleanSubagentReport(content) : content)}
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
