import { MessageSquareQuote } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { useEditKeys } from "@/hooks/useEditKeys";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { quoteComment } from "./quoteComment";

/** 選んだ範囲（文と、ボタンを出す位置） */
interface Picked {
  text: string;
  x: number;
  y: number;
}

/** ボタン・コメントの欄の幅（画面の端からはみ出さないように寄せる） */
const POPOVER_WIDTH = 320;

/** 選んでいる文が、root の中の 1 つの AI の返答（.assistant）の中にあれば、その文と位置 */
function pickedIn(root: HTMLElement | null): Picked | undefined {
  const selection = window.getSelection();
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const element = common instanceof Element ? common : common.parentElement;
  const message = element?.closest(".assistant");
  if (!message || !root.contains(message)) return undefined;
  const text = selection.toString().trim();
  if (!text) return undefined;
  const rect = range.getBoundingClientRect();
  return {
    text,
    x: Math.max(8, Math.min(rect.left + rect.width / 2 - 50, window.innerWidth - POPOVER_WIDTH - 8)),
    y: Math.max(8, rect.top - 38),
  };
}

/**
 * 選んだ範囲へのコメント: AI の返答の一部を選ぶと、その上に「コメント」のボタンを出し、
 * 押すとコメントを書く欄を開く。「入力欄に添える」で、選んだ文の引用とコメントをチャット欄の文の後ろに足す
 * （送るのは自分で。ほかの指示と一緒に送れる）。Enter で添える・Shift+Enter で改行・Esc でやめる
 */
export function SelectionComment({ root, onAdd }: { root: RefObject<HTMLElement | null>; onAdd: (block: string) => void }) {
  const [picked, setPicked] = useState<Picked>();
  const [writing, setWriting] = useState(false);
  const [comment, setComment] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setPicked(undefined);
    setWriting(false);
    setComment("");
  };
  // 選び終えたとき（マウスを離した・Shift と矢印で選んだ）に見る。コメントを書いている間は選び直さない
  const check = (e: Event) => {
    if (writing || boxRef.current?.contains(e.target as Node)) return;
    requestAnimationFrame(() => setPicked(pickedIn(root.current)));
  };
  useWindowEvent("mouseup", check);
  useWindowEvent("keyup", (e) => e.shiftKey && check(e));
  // 流れをスクロールしたら位置がずれるので消す（コメントを書いている間は残す）
  useWindowEvent("scroll", () => !writing && setPicked(undefined), true, true);
  useDismiss(boxRef, close, { enabled: Boolean(picked) });
  const add = () => {
    if (!picked) return;
    onAdd(quoteComment(picked.text, comment));
    window.getSelection()?.removeAllRanges();
    close();
  };
  // Enter で添える・Shift+Enter で改行（Esc は外側のクリックと同じく useDismiss が閉じる）
  const keys = useEditKeys({ onSubmit: add });

  if (!picked) return null;
  return (
    <div ref={boxRef} className={writing ? "selection-comment writing" : "selection-comment"} style={{ left: picked.x, top: picked.y }}>
      {writing ? (
        <>
          <blockquote className="selection-comment-quote">{picked.text}</blockquote>
          <textarea
            autoFocus
            rows={3}
            value={comment}
            placeholder="この部分へのコメント（空なら引用だけ添えます）"
            onChange={(e) => setComment(e.target.value)}
            {...keys.keyProps}
          />
          <div className="selection-comment-actions">
            <button type="button" className="btn" onClick={close}>
              やめる
            </button>
            <button type="button" className="btn btn-primary" onClick={add}>
              入力欄に添える
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="btn selection-comment-open"
          title="選んだ部分を引用して、コメントをチャット欄に添えます"
          // 押してもピントが移って選択が消えないように
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setWriting(true)}
        >
          <MessageSquareQuote size={13} aria-hidden />
          コメント
        </button>
      )}
    </div>
  );
}
