import "./subagentBody.css";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { subagentReport, type SubagentEntry } from "@shared/chat/subagents";
import { isSubagentTool } from "@shared/ai/claudeTools";
import { PROVIDER_LABELS } from "@shared/settings/types";
import { cx } from "@/foundation/ui/lib/cx";
import { useSizeObserver } from "@/foundation/ui/hooks/useSizeObserver";
import { LazyDetails } from "@/foundation/ui/kit/LazyDetails";
import { Markdown } from "@/foundation/ui/markdown/Markdown";
import { openKey, useTimelineOpen, Working, type RenderScope } from "@/features/chat/ui";
import type { SubagentsView } from "./subagentsContext";
import type { SubagentScope } from "./useSubagentScope";

/*
 * サブエージェントの中身の部品（流れの中のカードと右の欄の画面で共通）: 起動したエージェントからの依頼・手順（発言・ツール・入れ子のカード・作業中の行）・
 * 起動したエージェントへの報告
 */

/** 手順（発言・ツール・入れ子のカード）と、実行中なら作業中の行。中身の項目がなければ、その理由 */
export function SubagentSteps({ entry, view, steps, renderScope }: { entry: SubagentEntry; view: SubagentsView; steps: SubagentScope; renderScope: RenderScope }) {
  const running = entry.status === "running";
  return (
    <>
      {renderScope(steps.events, steps.scope, view.busy && running, <p className="muted small">{emptyText(entry, running, PROVIDER_LABELS[view.provider])}</p>)}
      {running && <Working>{workingText(entry)}</Working>}
    </>
  );
}

/**
 * 起動したエージェントへの報告（まだなければ出さない）。limited（流れの中のカード）なら、長い報告は高さを抑えて中でスクロールさせ
 * （.subagent-result-body.limited。チャットの流れを報告の全文で埋めない）、見出しの右の「全文を表示」「高さを抑える」で切り替える。
 * 右の欄のサブエージェントの画面は、報告を読むための場所なので全文のまま
 */
export function SubagentReport({ entry, view, limited = false }: { entry: SubagentEntry; view: SubagentsView; limited?: boolean }) {
  const report = subagentReport(entry, view.events);
  // 高さの上限を超えるほど長いか（描いてから測る。コードの色付け・図などで後から伸びるので、大きさが変わるたびに測り直す）と、全文を出しているか。
  // 高さは、高さを抑える枠の内側の要素の大きさの知らせで測る（scrollHeight を読まない。知らせは描く前に届くので、変わったときだけその場で描き直す）
  const [long, setLong] = useState(false);
  const longRef = useRef(false);
  const [full, setFull] = useTimelineOpen(view.chatId, openKey.report(entry.key));
  const measureRef = useSizeObserver<HTMLDivElement>(({ height }) => {
    const next = height > REPORT_LIMIT_PX + 40;
    if (!limited || next === longRef.current) return;
    longRef.current = next;
    flushSync(() => setLong(next));
  });
  if (!report) return null;
  const clamped = limited && long && !full;
  return (
    <div className="subagent-result card">
      <div className="subagent-result-head">
        <div className="subagent-label">起動したエージェントへの報告</div>
        {limited && long && (
          <button
            type="button"
            className="link-button subagent-result-toggle"
            aria-expanded={full}
            title={full ? "報告の高さを抑えて、中でスクロールさせます" : "報告の全文を、高さを抑えずに表示します"}
            onClick={() => setFull(!full)}
          >
            {full ? <ChevronsDownUp size={12} aria-hidden /> : <ChevronsUpDown size={12} aria-hidden />}
            {full ? "高さを抑える" : "全文を表示"}
          </button>
        )}
      </div>
      <div className={cx("subagent-result-body", clamped && "limited")} style={clamped ? { maxHeight: REPORT_LIMIT_PX } : undefined}>
        <div ref={measureRef}>
          <Markdown>{report}</Markdown>
        </div>
      </div>
    </div>
  );
}

/** 流れの中のカードで、報告をここまでの高さに抑える（これより 40px 以上長いときだけ抑える。少しだけはみ出すものは抑えない） */
const REPORT_LIMIT_PX = 320;

/**
 * 中身の記録がないときの文。サブエージェントの中で起動したサブエージェント（孫より深いもの）の中の手順は Claude Code が送ってこないので、
 * その旨と、届くもの（最後のツール・回数・報告）を伝える
 */
function emptyText(entry: SubagentEntry, running: boolean, ai: string): string {
  if (entry.parentKey !== undefined)
    return `サブエージェントの中で起動したサブエージェントの途中の手順は、${ai} が送ってこないため出せません（実行中の最後のツール・ツールの回数・トークン数・報告は出ます）`;
  return running ? "まだ動きがありません…" : "このサブエージェントの中身は記録されていません";
}

/** 実行中のカードの中身の最後の行（子の結果を待っている・ツールを実行中・作業中） */
function workingText(entry: SubagentEntry): string {
  const tool = entry.pendingTool ?? entry.lastTool;
  if (tool && isSubagentTool(tool)) return "中で起動したサブエージェントの終わりを待っています";
  return tool ? `${tool} を実行中` : "作業中";
}

/** 起動したエージェントからの依頼（初めは 1 行にたたみ、開くと全文） */
export function SubagentPrompt({ text, chatId, agentKey }: { text: string; chatId: number; agentKey: string }) {
  // 開閉は流れの見え方の店（流れの中のカードと右の欄の画面で同じ）
  const [open, setOpen] = useTimelineOpen(chatId, openKey.subagentPrompt(agentKey));
  const first = text.split("\n").find((line) => line.trim()) ?? "";
  return (
    // 全文の Markdown は、初めて開いたときに解析する
    <LazyDetails
      className="subagent-prompt"
      open={open}
      onOpenChange={setOpen}
      summary={
        <summary className="fold-summary">
          <ChevronRight size={13} className="tool-chevron" />
          <span className="subagent-label">起動したエージェントからの依頼</span>
          <span className="subagent-prompt-first">{first}</span>
        </summary>
      }
    >
      {() => (
        <div className="subagent-prompt-body">
          <Markdown>{text}</Markdown>
        </div>
      )}
    </LazyDetails>
  );
}
