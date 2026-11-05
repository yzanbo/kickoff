import { ChevronRight, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { BashOutput } from "./BashOutput";
import { summarizeTools, type ToolCall } from "@/features/chat/timeline/timelineItems";
import { describeTool, describeToolInput, toolLabel, visibleToolResult } from "./toolDescribe";
import { CallTime, GroupTime } from "./ToolTime";

/**
 * ツールのまとまり（閉じた状態では「2個のファイルを編集 および 3個のコマンドを実行」のように要約し、後ろに時刻を出す）。
 * active: いまの作業の中のまとまり（作業中のチャットで、結果の届いていない呼び出しを実行中として見せる）
 */
export function ToolGroup({ tools, rel, active }: { tools: ToolCall[]; rel: (s: string) => string; active: boolean }) {
  const summary = summarizeTools(tools);
  const failed = tools.filter((t) => t.result?.data.is_error).length;
  // 実行中の呼び出し（並べて呼んだものは、結果の届いていないうちいちばん後ろ）
  const current = active ? tools.findLast((t) => !t.result) : undefined;
  const currentData = current && { name: current.use.data.name, input: current.use.data.input as Record<string, unknown> | undefined };
  const running = currentData !== undefined;

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
        {currentData ? (
          <span className="tool-current">{rel(describeTool(currentData.name, currentData.input ?? {}))}</span>
        ) : (
          failed > 0 && <span className="tool-failed">{failed} 件失敗</span>
        )}
        <GroupTime tools={tools} running={running} />
      </summary>
      <div className="tool-calls">
        {tools.map((t) => (
          <ToolItem key={t.use.id} call={t} rel={rel} running={active && !t.result} />
        ))}
      </div>
    </details>
  );
}

/** ツールの呼び出し 1 件（右に始めた時刻とかかった時間。開くと編集内容・結果を出す）。running: 結果を待っている（作業中のチャットのいまの作業） */
function ToolItem({ call, rel, running }: { call: ToolCall; rel: (s: string) => string; running: boolean }) {
  const { name } = call.use.data;
  const input = (call.use.data.input ?? {}) as Record<string, unknown>;
  // 一度でも開いたか（コマンドの色付けは、開いてから始める。閉じたままの呼び出しが多くても重くしない）
  const [opened, setOpened] = useState(false);
  const r = call.result?.data;
  // ツール検索の `[tool_reference]` のような意味のない結果は出さない
  const content = r?.content ? visibleToolResult(r.content) : "";
  let detail: ReactNode = null;
  // コマンドは、コマンドと出力（失敗の知らせも）を 1 つの枠で出すので、下の結果の欄は使わない
  const isCommand = name === "Bash" && typeof input.command === "string";
  if (isCommand) {
    detail = <BashOutput command={String(input.command)} result={r} rel={rel} highlight={opened} />;
  } else if ((name === "Edit" || name === "MultiEdit") && typeof input.old_string === "string") {
    detail = <Diff before={input.old_string} after={String(input.new_string ?? "")} />;
  } else if (name === "Write" && typeof input.content === "string") {
    detail = <Diff before="" after={input.content} maxLines={40} />;
  }
  return (
    <details className={cx("tool-call", r?.is_error && "error")} onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>
        <span className="tool-name">{toolLabel(name)}</span>
        <span className="tool-arg">{rel(describeToolInput(name, input))}</span>
        <CallTime call={call} running={running} />
      </summary>
      {detail}
      {content && !isCommand && (r?.is_error || !detail) && (
        <pre className={cx("tool-output", r?.is_error && "error")}>
          {rel(content)}
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
