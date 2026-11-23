import { ChevronRight } from "lucide-react";
import { useContext } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { CommandLive } from "./CommandLive";
import { useCommandOutput } from "@/features/conversation/ui/background/commandOutputs";
import type { ToolCall } from "@/features/chat/ui";
import { toolKindOf } from "@shared/ai/claudeTools";
import { toolCallTexts } from "./toolCallTexts";
import { openKey, toolText, useTimelineOpen } from "@/features/chat/ui";
import { GroupTime } from "./ToolTime";
import { BackgroundCallsContext } from "@/features/conversation/ui/background/backgroundCalls";
import { callStatus, groupStatus, isCallRunning } from "./toolStatus";
import { ToolStatusIcon } from "./ToolStatusIcon";
import { LazyDetails } from "@/foundation/ui/kit/LazyDetails";
import { ToolItem } from "./ToolItem";

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
