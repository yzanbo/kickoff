import { ChevronRight } from "lucide-react";
import { Suspense, useContext } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { CommandLive } from "./CommandLive";
import { useCommandOutput } from "@/features/conversation/ui/background/commandOutputs";
import type { ToolCall } from "@/features/chat/ui";
import { visibleToolResult } from "@shared/chat/toolText";
import { toolKindOf } from "@shared/ai/claudeTools";
import { toolCallTexts } from "./toolCallTexts";
import { openKey, toolText, useTimelineOpen } from "@/features/chat/ui";
import { CallTime, GroupTime } from "./ToolTime";
import { BackgroundCallsContext } from "@/features/conversation/ui/background/backgroundCalls";
import { callStatus, groupStatus, isCallRunning } from "./toolStatus";
import { ToolStatusIcon } from "./ToolStatusIcon";
import { LazyDetails } from "@/features/conversation/ui/LazyDetails";
import { ToolPath } from "./ToolResultCode";
import { toolRowViewOf, type ToolRowProps } from "./toolRowViews";
import { FileLinkContext, openByClick } from "@/features/files/ui/links/fileLinkContext";

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
  const summary = toolText().summarizeTools(toolCallTexts(tools));
  const failed = tools.filter((t) => t.result?.data.is_error).length;
  // 実行中の呼び出し（並べて呼んだものは、動いているうちいちばん後ろ）
  const current = tools.findLast(isRunning);
  const currentData = current && { name: current.use.data.name, input: current.use.data.input as Record<string, unknown> | undefined };
  const running = currentData !== undefined;
  const status = groupStatus(tools.map((t) => callStatus(t, isRunning(t))));
  // 実行中のコマンドの出力（まとまりを閉じていても、下に最後の行を流す）
  const live = useCommandOutput(current && toolKindOf(current.use.data.name) === "command" ? current.use.data.id : undefined);
  // 開閉は流れの見え方の店（窓から外れて戻っても・画面を作り直しても開いたまま）
  const [open, setOpen] = useTimelineOpen(tools[0].use.chat_id, openKey.toolGroup(tools[0].use.id));

  return (
    <>
    {/* 呼び出しの一覧は、まとまりを初めて開いたときに作る（一覧の行のコマンドの色付けも、そこから始める） */}
    <LazyDetails
      className={cx("tool-group", failed > 0 && "has-error", running && "active")}
      open={open}
      onOpenChange={setOpen}
      // 動きの行などから、その呼び出しを含むまとまりへ移れるようにする（jumpToEvent）
      data-tool-ids={tools.map((t) => t.use.id).join(" ")}
      summary={
        <summary className="fold-summary">
          <ChevronRight size={14} className="tool-chevron" />
          <ToolStatusIcon status={status} />
          <span className="tool-summary">{summary}</span>
          {currentData ? (
            <span className="tool-current">{rel(toolText().describeTool(currentData.name, currentData.input ?? {}))}</span>
          ) : (
            failed > 0 && <span className="tool-failed">{failed} 件失敗</span>
          )}
          <GroupTime tools={tools} running={running} />
        </summary>
      }
    >
      {() => (
        <div className="tool-calls card">
          {tools.map((t) => (
            <ToolItem key={t.use.id} call={t} rel={rel} running={isRunning(t)} />
          ))}
        </div>
      )}
    </LazyDetails>
    {live !== null && <CommandLive command={typeof currentData?.input?.command === "string" ? currentData.input.command : ""} text={live} rel={rel} />}
    </>
  );
}

/**
 * ツールの呼び出し 1 件（左端に状態のアイコン、右に始めた時刻とかかった時間。開くと中身を出す）。running: まだ動いている（作業中のチャットのいまの作業で結果を待っている・裏で動かしたコマンドが終わっていない）。
 * 行の引数と開いた中身はツールの見せ方の表（toolRowViewOf）から。開いた中身は、初めて開いたときに作る（色付けもそこから）
 */
function ToolItem({ call, rel, running }: { call: ToolCall; rel: (s: string) => string; running: boolean }) {
  const { name } = call.use.data;
  const input = (call.use.data.input ?? {}) as Record<string, unknown>;
  const r = call.result?.data;
  // ツール検索の `[tool_reference]` のような意味のない結果は出さない
  const content = r?.content ? visibleToolResult(r.content) : "";
  const view = toolRowViewOf(name, input);
  const props: ToolRowProps = { call, input, result: r, content, rel, fileArg: (path, label) => <ToolFileArg path={path} label={label} /> };
  const [open, setOpen] = useTimelineOpen(call.use.chat_id, openKey.toolCall(call.use.id));
  /** 開いた中身（中身がなければ・失敗したら結果の文。見せ方が結果も出すなら出さない） */
  const renderDetail = () => {
    const Detail = view?.Detail && (view.hasDetail?.(props) ?? true) ? view.Detail : null;
    const showResult = content && view?.result !== "never" && (r?.is_error || !Detail || view?.result === "also");
    return (
      <>
        {/* 登録した見せ方の部品は遅れて読む（初めて開いたときだけ一瞬待つ） */}
        {Detail && (
          <Suspense fallback={null}>
            <Detail {...props} />
          </Suspense>
        )}
        {showResult && <pre className={cx("tool-output", r?.is_error && "error")}>{rel(content)}</pre>}
      </>
    );
  };
  return (
    <LazyDetails
      className={cx("tool-call", r?.is_error && "error")}
      open={open}
      onOpenChange={setOpen}
      summary={
        <summary className="fold-summary">
          <ToolStatusIcon status={callStatus(call, running)} />
          <span className="tool-name">{toolText().toolLabel(name)}</span>
          <span className="tool-arg">{view?.Arg ? <view.Arg {...props} /> : rel(toolText().describeToolInput(name, input))}</span>
          <CallTime call={call} running={running} />
        </summary>
      }
    >
      {renderDetail}
    </LazyDetails>
  );
}

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
