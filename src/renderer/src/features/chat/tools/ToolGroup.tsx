import { ChevronRight } from "lucide-react";
import { useContext, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { BashOutput } from "./BashOutput";
import { CommandLive } from "./CommandLive";
import { useCommandOutput } from "./commandOutputs";
import { summarizeTools, type ToolCall } from "@/features/chat/timeline/timelineItems";
import { describeTool, describeToolInput, toolLabel, visibleToolResult } from "./toolDescribe";
import { CallTime, GroupTime } from "./ToolTime";
import { BackgroundCallsContext } from "./backgroundCalls";
import { callStatus, groupStatus, isCallRunning } from "./toolStatus";
import { ToolStatusIcon } from "./ToolStatusIcon";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { ReadResult, SearchResult, SearchTitle, ToolPath } from "./ToolResultCode";
import { ReadImage } from "./ReadImage";
import { DB_QUERY_TOOL, DbQueryToolDetail } from "@/features/database/DbQueryToolDetail";
import { toolImageType } from "@shared/chat/toolImage";
import { FileLinkContext, openByClick } from "@/features/fileLinks/fileLinkContext";

/**
 * ツールのまとまり（閉じた状態では「2個のファイルを編集 および 3個のコマンドを実行」のように要約し、後ろに時刻を出す）。
 * 開閉の矢印の右に、まとまりの状態のアイコン（実行中 → 失敗 → 中断 → 完了。groupStatus）。
 * 実行中のコマンドの出力が届いていれば、まとまりの下に、打ったコマンドと出力の最後の行を流す（CommandLive。閉じていても見える）。
 * active: いまの作業の中のまとまり（作業中のチャットで、結果の届いていない呼び出しを実行中として見せる）。
 * 裏で動かしたコマンドは、終わるまで（裏の作業の一覧に残っている間）作業をまたいでも実行中として見せる（BackgroundCallsContext）
 */
export function ToolGroup({ tools, rel, active }: { tools: ToolCall[]; rel: (s: string) => string; active: boolean }) {
  const background = useContext(BackgroundCallsContext);
  const isRunning = (t: ToolCall) => isCallRunning(t, active, background);
  const summary = summarizeTools(tools);
  const failed = tools.filter((t) => t.result?.data.is_error).length;
  // 実行中の呼び出し（並べて呼んだものは、動いているうちいちばん後ろ）
  const current = tools.findLast(isRunning);
  const currentData = current && { name: current.use.data.name, input: current.use.data.input as Record<string, unknown> | undefined };
  const running = currentData !== undefined;
  const status = groupStatus(tools.map((t) => callStatus(t, isRunning(t))));
  // 一度でも開いたか（一覧の行のコマンドの色付けは、まとまりを開いてから始める）
  const [opened, setOpened] = useState(false);
  // 実行中のコマンドの出力（まとまりを閉じていても、下に最後の行を流す）
  const live = useCommandOutput(current?.use.data.name === "Bash" ? current.use.data.id : undefined);

  return (
    <>
    <details
      className={cx("tool-group", failed > 0 && "has-error", running && "active")}
      onToggle={(e) => e.currentTarget.open && setOpened(true)}
      // 動きの行などから、その呼び出しを含むまとまりへ移れるようにする（jumpToEvent）
      data-tool-ids={tools.map((t) => t.use.id).join(" ")}
    >
      <summary>
        <ChevronRight size={14} className="tool-chevron" />
        <ToolStatusIcon status={status} />
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
          <ToolItem key={t.use.id} call={t} rel={rel} running={isRunning(t)} listed={opened} />
        ))}
      </div>
    </details>
    {live !== null && <CommandLive command={typeof currentData?.input?.command === "string" ? currentData.input.command : ""} text={live} rel={rel} />}
    </>
  );
}

/**
 * ツールの呼び出し 1 件（左端に状態のアイコン、右に始めた時刻とかかった時間。開くと編集内容・結果を出す）。running: まだ動いている（作業中のチャットのいまの作業で結果を待っている・裏で動かしたコマンドが終わっていない）。
 * listed: まとまりを開いて一覧が見えている（コマンドの行は、1 行の表示にもシェルの文法で色を付ける）
 */
function ToolItem({ call, rel, running, listed }: { call: ToolCall; rel: (s: string) => string; running: boolean; listed: boolean }) {
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
  const isSearch = (name === "Grep" || name === "Glob") && typeof input.pattern === "string";
  // チャットの AI が DB に流した SQL（全文と「SQL のタブで開く」。結果の文も下に出す）
  const isDbQuery = name === DB_QUERY_TOOL && typeof input.sql === "string";
  // 見出しの行の色付けは、まとまりを開いて一覧が見えてから（コマンドと同じ）
  const highlightTitle = listed || opened;
  if (isCommand) {
    detail = <BashOutput command={String(input.command)} result={r} rel={rel} highlight={opened} />;
  } else if (isDbQuery) {
    detail = <DbQueryToolDetail chatId={call.use.chat_id} sql={String(input.sql)} connectionName={strOf(input.connection)} result={r?.content} highlight={opened} />;
  } else if ((name === "Edit" || name === "MultiEdit") && typeof input.old_string === "string") {
    detail = <Diff before={input.old_string} after={String(input.new_string ?? "")} />;
  } else if (name === "Write" && typeof input.content === "string") {
    detail = <Diff before="" after={input.content} maxLines={40} />;
  } else if (r && !r.is_error && name === "Read" && typeof input.file_path === "string" && toolImageType(input.file_path)) {
    // 読んだ画像は記録に残らない（結果は「[image]」の文字だけ）ので、開いてから入力のパスで、いまのファイルを読んで出す
    detail = opened ? <ReadImage chatId={call.use.chat_id} path={input.file_path} readAt={call.result?.created_at} /> : <></>;
  } else if (content && !r?.is_error && name === "Read" && typeof input.file_path === "string") {
    detail = <ReadResult content={rel(content)} path={input.file_path} highlight={opened} />;
  } else if (content && !r?.is_error && isSearch) {
    detail = <SearchResult content={rel(content)} mode={name === "Grep" ? strOf(input.output_mode) ?? "files_with_matches" : undefined} path={strOf(input.path)} highlight={opened} />;
  }
  return (
    <details className={cx("tool-call", r?.is_error && "error")} onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>
        <ToolStatusIcon status={callStatus(call, running)} />
        <span className="tool-name">{toolLabel(name)}</span>
        <span className="tool-arg">
          {/* コマンドは 1 行に収めた表示にも色を付ける（改行は空白に見える。色付けの結果は開いた欄と共有） */}
          {isCommand ? (
            <HighlightedCode code={rel(String(input.command))} lang={highlightTitle ? "shellscript" : undefined} />
          ) : isSearch ? (
            <SearchTitle glob={name === "Glob"} pattern={String(input.pattern)} path={rel(strOf(input.path) ?? "")} highlight={highlightTitle} />
          ) : FILE_TOOLS.has(name) && typeof input.file_path === "string" ? (
            <ToolFileArg path={input.file_path} label={rel(describeToolInput(name, input))} />
          ) : name === "Read" && typeof input.file_path === "string" ? (
            <ToolPath path={rel(input.file_path)} />
          ) : (
            rel(describeToolInput(name, input))
          )}
        </span>
        <CallTime call={call} running={running} />
      </summary>
      {detail}
      {content && !isCommand && (r?.is_error || !detail || isDbQuery) && (
        <pre className={cx("tool-output", r?.is_error && "error")}>
          {rel(content)}
        </pre>
      )}
    </details>
  );
}

/** 文字列の入力（なければ undefined） */
const strOf = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

/** ファイルを変えるツール（行のファイル名を押して開ける） */
const FILE_TOOLS = new Set(["Edit", "MultiEdit", "Write"]);

/**
 * ファイルを変えるツールの行のファイル名。作業場所の中のファイルなら押して開ける（右の欄。コミットしていない変更があれば変更のタブのその位置、なければ中身。
 * ⌘クリックでファイルタブ・右クリックでほかの開き方）。行の開閉はしない
 */
function ToolFileArg({ path, label }: { path: string; label: string }) {
  const links = useContext(FileLinkContext);
  const root = links ? `${links.index.root}/` : undefined;
  if (!links || !root || !path.startsWith(root)) return <ToolPath path={label} />;
  const ref = { path: path.slice(root.length) };
  return (
    <button
      type="button"
      className="link-button hover-bg tool-file-link"
      title={`${ref.path} を${links.side ? "右の欄" : "ファイルタブ"}で開く（⌘クリックでファイルタブ・右クリックでほかの開き方）`}
      onClick={(e) => {
        e.preventDefault();
        openByClick(links, e, ref);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        links.showMenu(e, ref);
      }}
    >
      <ToolPath path={label} />
    </button>
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
