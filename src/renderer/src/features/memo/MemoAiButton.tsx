import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useEditKeys } from "@/hooks/useEditKeys";
import { IconButton } from "@/ui/IconButton";
import { Popover, usePopover } from "@/ui/Popover";
import { MEMO_AI_PRESETS, type MemoAi } from "./useMemoAi";

/**
 * メモの見出しの「AI で直す」。押すと、何を直すか（本文で選んだ部分 / メモ全体）と、定型の頼み・自由な頼みの欄を出す。
 * 頼むとポップオーバーを閉じ、案は本文の上に差分で出る（MemoAiProposal）
 */
export function MemoAiButton({ ai }: { ai: MemoAi }) {
  const popover = usePopover();
  const [instruction, setInstruction] = useState("");
  // 開いたときの範囲（ポップオーバーに移ってもエディタの選択は残る）
  const [scope, setScope] = useState<{ part: boolean; chars: number } | null>(null);
  const run = (text: string) => {
    if (!text.trim()) return;
    popover.close();
    setInstruction("");
    ai.run(text.trim());
  };
  const keys = useEditKeys({ onSubmit: () => run(instruction), onCancel: popover.close });
  return (
    <>
      <IconButton
        ref={popover.anchor}
        icon={Sparkles}
        label="AI で直す（本文で範囲を選ぶと、その部分だけ）"
        aria-expanded={popover.open}
        disabled={ai.busy !== null}
        onClick={() => {
          const t = ai.target();
          setScope(t && { part: t.part, chars: t.text.length });
          popover.toggle();
        }}
      />
      {popover.open && (
        <Popover anchor={popover.anchor} align="end" title="AI で直す" label="AI で直す" className="memo-ai-popover" onClose={popover.close}>
          <p className="muted small memo-ai-scope">
            {scope?.part ? `選んだ部分（${scope.chars} 文字）を直します。` : "メモ全体を直します。本文で範囲を選んでから開くと、その部分だけを直せます。"}
            案は差分で見せ、取り込むまでメモは変わりません。
          </p>
          <div className="memo-ai-presets">
            {MEMO_AI_PRESETS.map((p) => (
              <button key={p.label} type="button" className="btn btn-sm" title={p.instruction} onClick={() => run(p.instruction)}>
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            autoFocus
            rows={2}
            className="memo-ai-input"
            value={instruction}
            placeholder="頼み（例: 表にまとめて）。Enter で頼む、Shift+Enter で改行"
            onChange={(e) => setInstruction(e.target.value)}
            {...keys.keyProps}
          />
          <div className="memo-ai-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={!instruction.trim()} onClick={() => run(instruction)}>
              頼む
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}
