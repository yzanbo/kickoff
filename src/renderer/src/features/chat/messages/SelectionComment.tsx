import { MessageSquareQuote } from "lucide-react";
import { useRef, useState } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { useEditKeys } from "@/hooks/useEditKeys";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { panelKey } from "@/features/panel/surfaces";
import { quoteCode, quoteComment } from "./quoteComment";

/** 選んだ範囲（見せる文・ボタンを出す位置・コメントを添えた文の作り方） */
interface Picked {
  text: string;
  x: number;
  y: number;
  quote: (comment: string) => string;
}

/** ボタン・コメントの欄の幅（画面の端からはみ出さないように寄せる） */
const POPOVER_WIDTH = 320;

/** 選んだ範囲の上にボタンを出す位置 */
function placeOf(range: Range) {
  const rect = range.getBoundingClientRect();
  return {
    x: Math.max(8, Math.min(rect.left + rect.width / 2 - 50, window.innerWidth - POPOVER_WIDTH - 8)),
    y: Math.max(8, rect.top - 38),
  };
}

/** 選んでいる範囲（なければ undefined） */
function currentRange(): { selection: Selection; range: Range; element: Element | null } | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  return { selection, range, element: common instanceof Element ? common : common.parentElement };
}

/** 選んでいる文が、root の中の 1 つの AI の返答（.assistant）の中にあれば、その文と位置（返答の文を引用する） */
function pickedInReply(root: HTMLElement | null): Picked | undefined {
  const at = currentRange();
  const message = at?.element?.closest(".assistant");
  if (!at || !root || !message || !root.contains(message)) return undefined;
  const text = at.selection.toString().trim();
  if (!text) return undefined;
  return { text, ...placeOf(at.range), quote: (comment) => quoteComment(text, comment) };
}

/**
 * 選んでいる範囲が、side（このチャットの右の欄）の「変更」の 1 つのファイルの差分の中にあれば、その行と位置（パスと行番号付きでコードを引用する）。
 * 変更後の行を選んでいれば変更後の行だけ、なければ変更前の行を使う（左右に並べた表では、行ごと選ばれて両側が入るため）
 */
function pickedInDiff(side: Element | null): Picked | undefined {
  const at = currentRange();
  const section = at?.element?.closest<HTMLElement>(".side-change[data-change-path]");
  if (!at || !side || !section || !side.contains(section)) return undefined;
  const cells = [...section.querySelectorAll<HTMLElement>(".diff-code[data-no]")].filter((cell) => at.range.intersectsNode(cell));
  const changed = cells.some((c) => c.dataset.side === "new") ? "new" : "old";
  const picked = cells.filter((c) => c.dataset.side === changed);
  if (picked.length === 0) return undefined;
  // 1 列の表の行の頭の +・- は、コードに入れない
  const codeOf = (cell: HTMLElement) => (cell.textContent ?? "").slice(cell.querySelector(".diff-sign")?.textContent?.length ?? 0);
  const numbers = picked.map((c) => Number(c.dataset.no));
  const code = picked.map(codeOf).join("\n");
  const range = { path: section.dataset.changePath ?? "", from: Math.min(...numbers), to: Math.max(...numbers), side: changed } as const;
  return { text: code, ...placeOf(at.range), quote: (comment) => quoteCode({ ...range, code, comment }) };
}

/**
 * 選んだ範囲へのコメント: AI の返答の一部・右の欄の「変更」の差分の行を選ぶと、その上に「コメント」のボタンを出し、
 * 押すとコメントを書く欄を開く。「入力欄に添える」で、選んだ文の引用（差分はパスと行番号付きのコードのブロック）とコメントをチャット欄の文の後ろに足す
 * （何件か書いてから、まとめて送れる）
 * （送るのは自分で。ほかの指示と一緒に送れる）。Enter で添える・Shift+Enter で改行・Esc でやめる
 */
export function SelectionComment() {
  const { root, chatId, fillComposer } = useChatPane();
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
    requestAnimationFrame(() => setPicked(pickedInReply(root.current) ?? pickedInDiff(document.querySelector(`[data-panel-key="${panelKey("agents", chatId)}"]`))));
  };
  useWindowEvent("mouseup", check);
  useWindowEvent("keyup", (e) => e.shiftKey && check(e));
  // 流れをスクロールしたら位置がずれるので消す（コメントを書いている間は残す）
  useWindowEvent("scroll", () => !writing && setPicked(undefined), true, true);
  useDismiss(boxRef, close, { enabled: Boolean(picked) });
  const add = () => {
    if (!picked) return;
    fillComposer(picked.quote(comment), { append: true });
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
