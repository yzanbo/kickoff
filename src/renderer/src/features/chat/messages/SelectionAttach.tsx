import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { panelKey } from "@/features/panel/surfaces";
import { quoteCode, quoteComment } from "./quoteComment";

/** 選んだ範囲（ボタンを出す位置と、チャット欄に足す引用） */
export interface Picked {
  x: number;
  y: number;
  quote: string;
}

/** ボタンを画面の端からはみ出さないように寄せるときの幅 */
const BUTTON_WIDTH = 140;

/** 選んだ範囲（画面の位置）の上にボタンを出す位置 */
export function placeAbove(rect: { left: number; top: number; width: number }): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(rect.left + rect.width / 2 - BUTTON_WIDTH / 2, window.innerWidth - BUTTON_WIDTH - 8)),
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

/** 選んでいる文が、root の中の 1 つの AI の返答（.assistant）の中にあれば、その引用と位置 */
export function pickedInReply(root: Element | null): Picked | undefined {
  const at = currentRange();
  const message = at?.element?.closest(".assistant");
  if (!at || !root || !message || !root.contains(message)) return undefined;
  const text = at.selection.toString().trim();
  if (!text) return undefined;
  return { ...placeAbove(at.range.getBoundingClientRect()), quote: quoteComment(text, "") };
}

/**
 * 選んでいる範囲が、side（このチャットの右の欄）の「変更」の 1 つのファイルの差分の中にあれば、その行と位置（パスと行番号付きでコードを引用する）。
 * 変更後の行を選んでいれば変更後の行だけ、なければ変更前の行を使う（左右に並べた表では、行ごと選ばれて両側が入るため）
 */
export function pickedInDiff(side: Element | null): Picked | undefined {
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
  return { ...placeAbove(at.range.getBoundingClientRect()), quote: quoteCode({ ...range, code, comment: "" }) };
}

/**
 * 選んだ範囲をチャットに添付する: AI の返答の一部・右の欄の「変更」の差分の行を選ぶと、その上に「チャットに添付」のボタンを出し、
 * 押すと選んだ文の引用（差分はパスと行番号付きのコードのブロック）を、すぐチャット欄の文の後ろに足す（何件か足してから、まとめて送れる。送るのは自分で）
 */
export function SelectionAttach() {
  const { root, chatId, fillComposer } = useChatPane();
  return (
    <SelectionAttachBox
      pick={() => pickedInReply(root.current) ?? pickedInDiff(document.querySelector(`[data-panel-key="${panelKey("agents", chatId)}"]`))}
      onAdd={(text) => fillComposer(text, { append: true })}
    />
  );
}

/**
 * 選んだ範囲の上の「チャットに添付」（pick が、いま選んでいる範囲が添付できる所かを決める）。押すと onAdd に引用を渡す。
 * 別ウィンドウ（変更・サブエージェント）・右の欄のメモでは、足す先（メインのウィンドウのチャット欄など）を onAdd で渡す
 */
export function SelectionAttachBox({ pick, onAdd }: { pick: () => Picked | undefined; onAdd: (text: string) => void }) {
  const [picked, setPicked] = useState<Picked>();
  const boxRef = useRef<HTMLDivElement>(null);
  const close = () => setPicked(undefined);
  // 選び終えたとき（マウスを離した・Shift と矢印で選んだ）に見る
  const check = (e: Event) => {
    if (boxRef.current?.contains(e.target as Node)) return;
    requestAnimationFrame(() => setPicked(pick()));
  };
  useWindowEvent("mouseup", check);
  useWindowEvent("keyup", (e) => e.shiftKey && check(e));
  // スクロールしたら位置がずれるので消す
  useWindowEvent("scroll", close, true, true);
  useDismiss(boxRef, close, { enabled: Boolean(picked) });

  if (!picked) return null;
  return (
    <div ref={boxRef} className="selection-attach" style={{ left: picked.x, top: picked.y }}>
      <button
        type="button"
        className="btn selection-attach-button"
        title="選んだ部分を引用して、チャットの入力欄に足します（送るのは自分で）"
        // 押してもピントが移って選択が消えないように
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onAdd(picked.quote);
          window.getSelection()?.removeAllRanges();
          close();
        }}
      >
        <Paperclip size={13} aria-hidden />
        チャットに添付
      </button>
    </div>
  );
}
