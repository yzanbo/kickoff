import { MessageSquarePlus, SquarePen } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { MenuItem } from "@/ui/PopupMenu";
import { MAX_ASK_CHILD_QUOTE, openAskChild } from "@/features/chat/children/childChats";
import { addToChat } from "@/features/chat/pane/addToChat";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { SelectionMemoButton } from "@/features/memo/SelectionMemoButton";
import { selectionWithin } from "./quotable";
import { quoteCode, quoteComment } from "./quoteComment";
import { SelectionTargetButton } from "./SelectionTargetButton";

/** 選んだ範囲（画面の位置と、チャット欄に足す引用。返答なら、描いた表示を Markdown に戻した文も（メモにするとき）） */
export interface Picked {
  rect: { left: number; top: number; width: number };
  quote: string;
  markdown?: string;
  /** コードの行を選んだとき: 選んだ行のコード（行番号・+- を除いたもの）と行（パスを含めてコピー） */
  code?: { text: string; lines: { from: number; to: number } };
}

/** 足す先のボタンの横に置くもの（「メモ ▾」）に渡す操作: hold = メニューを開いている間は消さない / done = 済んだので選択ごと消す */
export interface ExtraControls {
  hold: (hold: boolean) => void;
  done: () => void;
}

/** 選んだ範囲の上のボタン 1 つ（押すと onAdd に引用を渡す。more があれば横の ▾ で、そのチャットに関わるほかの操作のメニューの項目を出す。done = 済んだので選択ごと消す） */
export interface AddTarget {
  label: string;
  title: string;
  onAdd: (text: string) => void;
  more?: (picked: Picked, done: () => void) => ReactNode;
}

/** ボタンを画面の端からはみ出さないように寄せるときの、ボタン 1 つの幅 */
const BUTTON_WIDTH = 140;

/** 選んだ範囲（画面の位置）の上に、幅 width のボタンを出す位置 */
function placeAbove(rect: Picked["rect"], width: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
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

/** 選んでいる文が、root の中の「チャットに追加できる所」（会話の流れ・サブエージェントの画面の手順。`data-quotable`）にあれば、その引用と位置 */
function pickedInQuotable(root: Element | null): Picked | undefined {
  const selected = selectionWithin(root, { quotable: true });
  if (!selected) return undefined;
  // 返答の Markdown の表示の中なら Markdown に戻したものも持つ（メモには書式のまま残す。右クリックの「メモ」と同じ）
  return { rect: selected.range.getBoundingClientRect(), quote: quoteComment(selected.text.trim(), ""), markdown: selected.markdown };
}

/**
 * 選んでいる範囲が、root の中の 1 つのファイルのコードの行（右の欄・別ウィンドウの「変更」の差分・「ファイル」の中身。`[data-quote-path]` の中の
 * `.diff-code[data-no]`）にあれば、その行と位置（パスと行番号付きでコードを引用する）。差分は、変更後の行を選んでいれば変更後の行だけ、なければ変更前の行を使う
 * （左右に並べた表では、行ごと選ばれて両側が入るため）。ファイルの中身の行には側がない
 */
export function pickedInCode(root: Element | null): Picked | undefined {
  const at = currentRange();
  const section = at?.element?.closest<HTMLElement>("[data-quote-path]");
  if (!at || !root || !section || !root.contains(section)) return undefined;
  const cells = [...section.querySelectorAll<HTMLElement>(".diff-code[data-no]")].filter((cell) => at.range.intersectsNode(cell));
  const side: "new" | "old" | null = cells.some((c) => c.dataset.side === "new") ? "new" : cells.some((c) => c.dataset.side === "old") ? "old" : null;
  const picked = cells.filter((c) => (c.dataset.side ?? null) === side);
  if (picked.length === 0) return undefined;
  // 1 列の表の行の頭の +・- は、コードに入れない
  const codeOf = (cell: HTMLElement) => (cell.textContent ?? "").slice(cell.querySelector(".diff-sign")?.textContent?.length ?? 0);
  const numbers = picked.map((c) => Number(c.dataset.no));
  const code = picked.map(codeOf).join("\n");
  const range = { path: section.dataset.quotePath ?? "", from: Math.min(...numbers), to: Math.max(...numbers), side };
  return { rect: at.range.getBoundingClientRect(), quote: quoteCode({ ...range, code, comment: "" }), code: { text: code, lines: { from: range.from, to: range.to } } };
}

/** メインの会話の中で選んだときのボタン */
const ADD_TO_THIS_CHAT: Omit<AddTarget, "onAdd"> = { label: "チャットに追加", title: "選択部分を引用して、チャットの入力欄に足します（送るのは自分で）" };

/**
 * メインの会話の中の文（発言・質問のカード・ツールの行・サブエージェントのカードなど。`data-quotable` の中）を選ぶと、その上に「チャットに追加 ▾」のボタンを出し、押すと選んだ文の引用を、すぐこのチャットの入力欄の文の後ろに足す
 * （何件か足してから、まとめて送れる。送るのは自分で）。▾ はチャットの操作だけ（子チャットで聞く・新しいチャットで聞く）。横に「メモ ▾」（SelectionMemoButton。メモの操作だけ）。
 * 右の欄・別ウィンドウの中のチャット（子チャット・メモのチャット）では出さない（SideSelectionAttach がメインのチャットと両方に足せるボタンを出す）
 */
export function SelectionAttach() {
  const { root, fillComposer, chatId, projectId, askInNewChat } = useChatPane();
  const inSide = useMainChat() !== null;
  if (inSide) return null;
  const more = (picked: Picked, done: () => void) => (
    <>
      {/* 選んだ文を引用して、このチャットの作業を止めずに横で聞く（発言の右クリックの「子チャットで聞く」と同じ） */}
      <MenuItem
        onSelect={() => {
          openAskChild({ parentId: chatId, eventId: null, quote: (picked.markdown ?? picked.quote).slice(0, MAX_ASK_CHILD_QUOTE) });
          done();
        }}
      >
        <MessageSquarePlus size={14} aria-hidden /> 子チャットで聞く
      </MenuItem>
      {/* チャットのタブが入っているパネルの中だけ（送信待ちの「新しいチャットで聞く」と同じ口） */}
      {askInNewChat && (
        <MenuItem
          title="選択部分の引用を入力欄に入れた新しいチャットを開きます（送るのは自分で）"
          onSelect={() => {
            askInNewChat({ text: picked.quote, attachments: [] });
            done();
          }}
        >
          <SquarePen size={14} aria-hidden /> 新しいチャットで聞く
        </MenuItem>
      )}
    </>
  );
  return (
    <SelectionAttachBox
      pick={() => pickedInQuotable(root.current)}
      targets={() => [{ ...ADD_TO_THIS_CHAT, onAdd: (text) => fillComposer(text, { append: true }), more }]}
      extra={(picked, controls) => (
        <SelectionMemoButton projectId={projectId()} chatId={chatId} text={picked.markdown ?? picked.quote} onHold={controls.hold} onDone={controls.done} />
      )}
    />
  );
}

/** 右の欄・別ウィンドウの中のチャットの画面の種類ごとの、そのチャットに足すボタンの名前 */
const INNER_LABELS: Record<string, string> = { child: "子チャットに追加", memo: "メモのチャットに追加" };

/**
 * 右の欄・別ウィンドウ（container の中）で、会話の文（子チャットの流れ・サブエージェントの画面の手順）・差分・ファイルの中身の行を選ぶと、その上に「チャットに追加」を出し、押すとメインのチャット（mainChatId）の入力欄に足す。
 * 子チャット・メモのチャットの中で選んだときは「メインに追加」と、そのチャットに足すボタン（「子チャットに追加」「メモのチャットに追加」）の 2 つ。
 * メモの本文は MemoSelectionAttach が出す
 */
export function SideSelectionAttach({ mainChatId, container }: { mainChatId: number; container: () => Element | null }) {
  // 選んだ所の中のチャットの画面（メインと別のチャットなら、その ID と種類）
  const innerChat = () => {
    const root = container();
    const page = currentRange()?.element?.closest<HTMLElement>(".chat-page[data-chat-id]");
    const chatId = Number(page?.dataset.chatId);
    if (!page || !root?.contains(page) || chatId === mainChatId) return undefined;
    return { chatId, label: INNER_LABELS[page.dataset.chatRole ?? ""] ?? "このチャットに追加" };
  };
  return (
    <SelectionAttachBox
      pick={() => pickedInCode(container()) ?? pickedInQuotable(container())}
      targets={() => {
        const inner = innerChat();
        const main: AddTarget = {
          label: inner ? "メインに追加" : "チャットに追加",
          title: "選択部分を引用して、メインのチャットの入力欄に足します（送るのは自分で）",
          onAdd: (text) => addToChat(mainChatId, text),
        };
        if (!inner) return [main];
        return [main, { label: inner.label, title: "選択部分を引用して、このチャットの入力欄に足します（送るのは自分で）", onAdd: (text) => addToChat(inner.chatId, text) }];
      }}
    />
  );
}

/**
 * 選んだ範囲の上のボタン（pick が、いま選んでいる範囲が足せる所かを決め、targets が足す先のボタンを決める）。押すとその onAdd に引用を渡す。
 * 別ウィンドウ・右の欄のメモでは、足す先（メインのウィンドウのチャット欄など）を targets で渡す。
 * extra はボタンの横に置くもの（メインの会話の「メモ ▾」）。足す先の ▾（more）・extra のメニューを開いている間（hold）は、外側のクリック・選び直し・スクロールで消さない
 */
export function SelectionAttachBox({
  pick,
  targets,
  extra,
}: {
  pick: () => Picked | undefined;
  targets: () => AddTarget[];
  extra?: (picked: Picked, controls: ExtraControls) => ReactNode;
}) {
  const [shown, setShown] = useState<{ picked: Picked; targets: AddTarget[] }>();
  const [held, setHeld] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setShown(undefined);
    setHeld(false);
  };
  const finish = () => {
    window.getSelection()?.removeAllRanges();
    close();
  };
  // 選び終えたとき（マウスを離した・Shift と矢印で選んだ）に見る
  const check = (e: Event) => {
    if (held || boxRef.current?.contains(e.target as Node)) return;
    requestAnimationFrame(() => {
      const picked = pick();
      setShown(picked ? { picked, targets: targets() } : undefined);
    });
  };
  useWindowEvent("mouseup", check);
  useWindowEvent("keyup", (e) => e.shiftKey && check(e));
  // スクロールしたら位置がずれるので消す
  useWindowEvent("scroll", () => !held && close(), true, true);
  useDismiss(boxRef, close, { enabled: Boolean(shown) && !held });

  if (!shown) return null;
  const at = placeAbove(shown.picked.rect, BUTTON_WIDTH * (shown.targets.length + (extra ? 1 : 0)));
  return (
    <div ref={boxRef} className="selection-attach" style={{ left: at.x, top: at.y }}>
      {shown.targets.map((target) => (
        <SelectionTargetButton key={target.label} target={target} picked={shown.picked} controls={{ hold: setHeld, done: finish }} />
      ))}
      {extra?.(shown.picked, { hold: setHeld, done: finish })}
    </div>
  );
}
