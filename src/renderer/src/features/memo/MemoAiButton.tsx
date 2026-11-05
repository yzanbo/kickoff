import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEditKeys } from "@/hooks/useEditKeys";
import { IconButton } from "@/ui/IconButton";
import { Popover, usePopover } from "@/ui/Popover";
import { MEMO_AI_PRESETS, type MemoAi } from "./useMemoAi";

/**
 * 本文の選択の上の「AI で直す」から開くときの、開く位置（画面の座標。above なら選んだ最初の行の上端、below なら最後の行の下端）と向き
 * （at は押した時刻。同じボタンを続けて押しても開き直す）。エディタの行の要素はピントが移ると描き直されて消えるので、要素ではなく座標で受ける
 */
export interface MemoAiOpenRequest {
  left: number;
  y: number;
  side: "above" | "below";
  at: number;
}

/**
 * メモの見出しの「AI で直す」。押すと、何を直すか（本文で選んだ部分 / メモ全体）と、定型の頼み・自由な頼みの欄を出す。
 * 本文で範囲を選んだときにその上に出る「AI で直す」（openFrom）からも、同じ欄をその場所に開く。
 * 頼むとポップオーバーを閉じ、案は本文の上に差分で出る（MemoAiProposal）
 */
export function MemoAiButton({ ai, openFrom }: { ai: MemoAi; openFrom: MemoAiOpenRequest | null }) {
  const popover = usePopover();
  // 欄を開いた場所（見出しのボタンか、選択の上のボタン）
  const anchor = useRef<HTMLElement | null>(null);
  // 選択から開くときの基準（その座標に置く見えない印）
  const mark = useRef<HTMLSpanElement>(null);
  // 選択の上のボタンから開いたときは、選んだ文を隠さない向き（openFrom.side）に出し、左端にそろえる（見出しのボタンからは下・右端）
  const [fromSelection, setFromSelection] = useState<"above" | "below" | null>(null);
  const [instruction, setInstruction] = useState("");
  // 開いたときの範囲（ポップオーバーに移ってもエディタの選択は残る。選んだ部分なら、その文を頼みの欄の上に引用で見せる）
  const [scope, setScope] = useState<{ part: boolean; text: string } | null>(null);
  const run = (text: string) => {
    if (!text.trim()) return;
    popover.close();
    setInstruction("");
    ai.run(text.trim());
  };
  const keys = useEditKeys({ onSubmit: () => run(instruction), onCancel: popover.close });
  const openAt = (el: HTMLElement | null, selection: "above" | "below" | null) => {
    const t = ai.target();
    setFromSelection(selection);
    setScope(t && { part: t.part, text: t.text });
    anchor.current = el;
    popover.setOpen(true);
  };
  // 選択の上の「AI で直す」を押した
  useEffect(() => {
    if (openFrom && ai.busy === null) openAt(mark.current, openFrom.side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFrom]);
  return (
    <>
      {openFrom && <span ref={mark} className="memo-ai-anchor" style={{ left: openFrom.left, top: openFrom.y }} aria-hidden />}
      <IconButton
        ref={popover.anchor}
        icon={Sparkles}
        label="AI で直す（本文で範囲を選ぶと、その部分だけ）"
        aria-expanded={popover.open}
        disabled={ai.busy !== null}
        onClick={() => (popover.open && anchor.current === popover.anchor.current ? popover.close() : openAt(popover.anchor.current, null))}
      />
      {popover.open && (
        <Popover anchor={anchor} side={fromSelection ?? "below"} align={fromSelection ? "start" : "end"} title="AI で直す" label="AI で直す" className="memo-ai-popover" onClose={popover.close}>
          <p className="muted small memo-ai-scope">
            {scope?.part ? `次の選んだ部分（${scope.text.length} 文字）を直します。` : "メモ全体を直します。本文で範囲を選んでから開くと、その部分だけを直せます。"}
            案は差分で見せ、取り込むまでメモは変わりません。
          </p>
          {scope?.part && <blockquote className="memo-ai-quote">{scope.text}</blockquote>}
          <div className="memo-ai-presets">
            {MEMO_AI_PRESETS.map((p) => (
              <button key={p.label} type="button" className="btn btn-sm" title={p.instruction} onClick={() => run(p.instruction)}>
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            autoFocus
            rows={4}
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
