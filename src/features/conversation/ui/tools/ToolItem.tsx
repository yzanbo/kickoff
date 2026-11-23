import { Suspense } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { visibleToolResult } from "@shared/chat/toolText";
import { openByClick, openKey, toolText, useChatFileLinks, useTimelineOpen, type ToolCall } from "@/features/chat/ui";
import { LazyDetails } from "@/foundation/ui/kit/LazyDetails";
import { CallTime } from "./ToolTime";
import { callStatus } from "./toolStatus";
import { ToolStatusIcon } from "./ToolStatusIcon";
import { ToolPath } from "./ToolResultCode";
import { toolRowViewOf, type ToolRowProps } from "./toolRowViews";

/**
 * ツールの呼び出し 1 件（左端に状態のアイコン、右に始めた時刻とかかった時間。開くと中身を出す）。running: まだ動いている（作業中のチャットのいまの作業で結果を待っている・裏で動かしたコマンドが終わっていない）。
 * 行の引数と開いた中身はツールの見せ方の表（toolRowViewOf）から。開いた中身は、初めて開いたときに作る（色付けもそこから）
 */
export function ToolItem({ call, rel, running }: { call: ToolCall; rel: (s: string) => string; running: boolean }) {
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
  const links = useChatFileLinks();
  const root = links ? `${links.root}/` : undefined;
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
