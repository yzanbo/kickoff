import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { cx } from "@/lib/cx";
import { lineCounts, lineDiff } from "@/lib/lineDiff";
import { CloseButton } from "@/ui/IconButton";
import { ChangeCounts } from "@/features/chat/tools/TurnChanges";
import type { MemoAi } from "./useMemoAi";

/**
 * メモの本文の上に出す AI の様子: 頼んでいる間（やめる）・失敗・案（差分と「取り込む / やめる」）。
 * 案は元の文と直した文を行ごとに比べて見せる（消した行は赤・足した行は緑。lib/lineDiff）。何も出すものがなければ描かない
 */
export function MemoAiProposal({ ai }: { ai: MemoAi }) {
  const { busy, proposal, error } = ai;
  const diff = useMemo(() => (proposal ? lineDiff(proposal.original, proposal.text) : []), [proposal]);
  const counts = lineCounts(diff);
  if (busy !== null) {
    return (
      <div className="memo-ai-bar" role="status">
        <Sparkles size={13} className="memo-ai-spin" aria-hidden />
        <span className="memo-ai-bar-text">AI が直しています…（{busy}）</span>
        <button type="button" className="btn btn-sm" onClick={ai.cancel}>
          やめる
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="memo-ai-bar error" role="alert">
        <span className="memo-ai-bar-text">{error}</span>
        <CloseButton size={13} label="閉じる" onClick={ai.clearError} />
      </div>
    );
  }
  if (!proposal) return null;
  return (
    <section className="memo-ai-proposal" aria-label="AI の案">
      <div className="memo-ai-bar">
        <Sparkles size={13} aria-hidden />
        <span className="memo-ai-bar-text" title={proposal.instruction}>
          AI の案（{proposal.part ? "選んだ部分" : "メモ全体"}）· {proposal.instruction}
        </span>
        <ChangeCounts {...counts} />
        <button type="button" className="btn btn-sm" onClick={ai.discard}>
          やめる
        </button>
        <button type="button" className="btn btn-sm btn-primary" title="本文を置き換えます（保存はしません。⌘Z で戻せます）" onClick={ai.accept}>
          取り込む
        </button>
      </div>
      <pre className="memo-ai-diff">
        {diff.map((d, i) => (
          <div key={i} className={cx("memo-ai-line", d.kind)}>
            <span className="memo-ai-mark" aria-hidden>
              {d.kind === "add" ? "+" : d.kind === "del" ? "−" : " "}
            </span>
            {d.text || " "}
          </div>
        ))}
      </pre>
    </section>
  );
}
