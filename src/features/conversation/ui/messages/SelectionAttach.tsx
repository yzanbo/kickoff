import { MessagesSquare, SquarePen, type LucideIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/foundation/ui/hooks/useDismiss";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { MAX_ASK_CHILD_QUOTE } from "@/features/childChats/ui/childChats";
import { openAskChild } from "@/features/chat/ui";
import { addToChat } from "@/features/composer/ui/addToChat";
import { askInNewChatOf, chatRoleOf, useChatScreen, useComposerPort } from "@/features/chat/ui";
import { useMainChat } from "@/features/chat/ui/screen/mainChat";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { chatTargetName } from "@/features/chat/ui/chatTitle";
import { focusedCodeSelection } from "@/foundation/ui/code/codeSelection";
import { selectionWithin } from "./quotable";
import { quoteCode, quoteComment } from "@/features/chat/ui/quote";
import { SelectionTargetButton } from "./SelectionTargetButton";
import { addTargetsOf } from "./addTargets";
import { preloadMessageActions, selectionActions, type SelectionContext } from "./messageActions";
import { placeAbove, SelectionBox } from "@/foundation/ui/kit/floating/SelectionBox";

/** 選んだ範囲（画面の位置と、チャット欄に足す引用。返答なら、描いた表示を Markdown に戻した文も（ノートにするとき）） */
export interface Picked {
  rect: { left: number; top: number; width: number };
  quote: string;
  markdown?: string;
  /** コードの行を選んだとき: 選んだ行のコード（行番号・+- を除いたもの）と行（パスを含めてコピー） */
  code?: { text: string; lines: { from: number; to: number } };
  /** 右の欄・別ウィンドウで「ノート ▾」を出すときの、ノートの出どころのチャット（子チャットならその子、サブエージェントなら足す先のチャット。出さないなら undefined） */
  noteChatId?: number;
}

/** 足す先のボタンの横に置くもの（「ノート ▾」）に渡す操作: hold = メニューを開いている間は消さない / done = 済んだので選択ごと消す */
export interface ExtraControls {
  hold: (hold: boolean) => void;
  done: () => void;
}

/** 選んだ範囲の上のボタン 1 つ（押すと onAdd に引用と選んだ範囲を渡す。icon がなければ「チャットに追加」のアイコン） */
export interface AddTarget {
  label: string;
  title: string;
  icon?: LucideIcon;
  onAdd: (text: string, picked: Picked) => void;
}

/** ボタンを画面の端からはみ出さないように寄せるときの、ボタン 1 つの幅 */
const BUTTON_WIDTH = 140;

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
  // 返答の Markdown の表示の中なら Markdown に戻したものも持つ（ノートには書式のまま残す。右クリックの「ノート」と同じ）
  return { rect: selected.range.getBoundingClientRect(), quote: quoteComment(selected.text.trim(), ""), markdown: selected.markdown };
}

/**
 * 選んでいる範囲が、root の中の 1 つのファイルのコードの行（右の欄・別ウィンドウの「変更」の差分・「ファイル」の中身。`[data-quote-path]` の中の
 * `.diff-code[data-no]`。ファイルの中身を編集の部品で開いていれば、その部品で選んだ行）にあれば、その行と位置（パスと行番号付きでコードを引用する）。差分は、変更後の行を選んでいれば変更後の行だけ、なければ変更前の行を使う
 * （左右に並べた表では、行ごと選ばれて両側が入るため）。ファイルの中身の行には側がない
 */
export function pickedInCode(root: Element | null): Picked | undefined {
  // 編集の部品（Monaco）で選んでいれば、その行（ページの選択にならないので、部品が置いた読み方で読む）
  const editing = root ? focusedCodeSelection(root) : undefined;
  if (editing) {
    const { from, to, code, rect } = editing.selection;
    return { rect, quote: quoteCode({ path: editing.section.dataset.quotePath ?? "", from, to, side: null, code, comment: "" }), code: { text: code, lines: { from, to } } };
  }
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

/** 上の機能のボタン（「ノート ▾」。出す先がなければ null） */
function SelectionActions(props: SelectionContext) {
  const buttons = selectionActions();
  if (buttons.length === 0) return null;
  return buttons.map((Button, i) => (
    <Suspense key={i} fallback={null}>
      <Button {...props} />
    </Suspense>
  ));
}

/**
 * チャットの画面の会話の中の文（発言・質問のカード・ツールの行・サブエージェントのカードなど。`data-quotable` の中）を選ぶと、その上にボタンを並べる:
 * 「チャットに追加」（すぐこのチャットの入力欄の文の後ろに引用を足す。何件か足してから、まとめて送れる。送るのは自分で）・
 * 「新しい子チャットで聞く」（引用を入れた子チャットを作り、このチャットの作業を止めずに横で聞く。発言の右クリックと同じ）・
 * 「新しいチャットで聞く」（チャットのタブが入っているパネルの中だけ。引用を入力欄に入れた新しいチャット）・「ノート ▾」（SelectionNoteButton。押すとノートへの入れ方のメニュー）。
 * 右の欄・別ウィンドウの中のチャット（子チャット・ノートのチャット）では出さない（SideSelectionAttach が足す先のチャットと両方に足せるボタンを出す）
 */
export function SelectionAttach() {
  const screen = useChatScreen();
  const { root, chatId, projectId } = screen;
  const composer = useComposerPort();
  const askInNewChat = askInNewChatOf(screen);
  const inSide = useMainChat() !== null;
  if (inSide) return null;
  const targets = (): AddTarget[] => [
    ...addTargetsOf({ chatId, mainChatId: null, role: screen.role, mainName: "" }).map((t) => ({
      label: `${t.name}に追加`,
      title: "選択部分を引用して、チャットの入力欄に足します（送るのは自分で）",
      onAdd: (text: string) => composer?.fill(text, { append: true }),
    })),
    {
      label: "新しい子チャットで聞く",
      title: "選択部分を引用した子チャットを作り、このチャットの作業を止めずに横で聞きます（送るのは自分で）",
      icon: MessagesSquare,
      onAdd: (_text, picked) => openAskChild({ parentId: chatId, eventId: null, quote: (picked.markdown ?? picked.quote).slice(0, MAX_ASK_CHILD_QUOTE) }),
    },
    ...(askInNewChat
      ? [
          {
            label: "新しいチャットで聞く",
            title: "選択部分の引用を入力欄に入れた新しいチャットを開きます（送るのは自分で）",
            icon: SquarePen,
            onAdd: (text: string) => askInNewChat({ text, attachments: [] }),
          },
        ]
      : []),
  ];
  return (
    <SelectionAttachBox
      pick={() => pickedInQuotable(root.current)}
      targets={targets}
      extra={(picked, controls) => <SelectionActions projectId={projectId} chatId={chatId} text={picked.markdown ?? picked.quote} onHold={controls.hold} onDone={controls.done} />}
    />
  );
}

/**
 * 右の欄・別ウィンドウ（container の中）で、会話の文（子チャットの流れ・サブエージェントの画面の手順）・差分・ファイルの中身の行を選ぶと、その上に「チャットに追加」を出し、押すとメインのチャット（mainChatId）の入力欄に足す。
 * ボタンの名前は足す先のチャットの名前（「「機能開発」に追加」。右の欄のどのタブでも同じ呼び方）。
 * 子チャット・ノートのチャットの中で選んだときは、それと、そのチャットに足すボタン（「子チャットに追加」「ノートのチャットに追加」）の 2 つ。
 * 子チャット・サブエージェントの会話の文なら、横に「ノート ▾」も出す（出どころは子チャットならその子、サブエージェントなら足す先のチャット。ノートのチャット・コードの行では出さない）。
 * ノートの本文は NoteSelectionAttach が出す
 */
export function SideSelectionAttach({ mainChatId, container }: { mainChatId: number; container: () => Element | null }) {
  // 選んだ所の中のチャットの画面（足す先と別のチャットなら、その ID と種類）
  const innerChat = () => {
    const root = container();
    const page = currentRange()?.element?.closest<HTMLElement>(".chat-page[data-chat-id]");
    const chatId = Number(page?.dataset.chatId);
    if (!page || !root?.contains(page) || chatId === mainChatId) return undefined;
    const chat = knownChat(chatId);
    return { chatId, role: chat ? chatRoleOf(chat) : null };
  };
  // 会話の文なら、ノートの出どころのチャットも覚える（ノートのチャットの中は除く）
  const pick = (): Picked | undefined => {
    const code = pickedInCode(container());
    if (code) return code;
    const picked = pickedInQuotable(container());
    if (!picked) return undefined;
    const inner = innerChat();
    return inner?.role === "note" ? picked : { ...picked, noteChatId: inner?.chatId ?? mainChatId };
  };
  return (
    <SelectionAttachBox
      pick={pick}
      targets={() => {
        const inner = innerChat();
        return addTargetsOf({ chatId: inner?.chatId ?? null, mainChatId, role: inner?.role ?? null, mainName: chatTargetName(knownChat(mainChatId)) }).map((t) => ({
          label: `${t.name}に追加`,
          title: `選択部分を引用して、${t.kind === "main" ? t.name : "このチャット"}の入力欄に足します（送るのは自分で）`,
          onAdd: (text: string) => addToChat(t.chatId, text),
        }));
      }}
      extra={(picked, controls) => {
        const from = picked.noteChatId;
        const projectId = from === undefined ? undefined : (knownChat(from) ?? knownChat(mainChatId))?.project_id;
        if (from === undefined || projectId === undefined) return null;
        return <SelectionActions projectId={projectId} chatId={from} text={picked.markdown ?? picked.quote} onHold={controls.hold} onDone={controls.done} />;
      }}
    />
  );
}

/**
 * 選んだ範囲の上のボタン（pick が、いま選んでいる範囲が足せる所かを決め、targets が足す先のボタンを決める）。押すとその onAdd に引用を渡す。
 * 別ウィンドウ・右の欄のノートでは、足す先（メインのウィンドウのチャット欄など）を targets で渡す。
 * extra はボタンの横に置くもの（メインの会話の「ノート ▾」）。足す先の ▾（more）・extra のメニューを開いている間（hold）は、外側のクリック・選び直し・スクロールで消さない
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
  // 上の機能のボタンの部品を先に読む（選んだときに読み込みを待たずに出す）
  useEffect(() => preloadMessageActions(), []);
  useWindowEvent("mouseup", check);
  useWindowEvent("keyup", (e) => e.shiftKey && check(e));
  // スクロールしたら位置がずれるので消す
  useWindowEvent("scroll", () => !held && close(), true, true);
  useDismiss(boxRef, close, { enabled: Boolean(shown) && !held });

  if (!shown) return null;
  const extraNode = extra?.(shown.picked, { hold: setHeld, done: finish });
  const at = placeAbove(shown.picked.rect, BUTTON_WIDTH * (shown.targets.length + (extraNode ? 1 : 0)));
  return (
    <SelectionBox ref={boxRef} at={at}>
      {shown.targets.map((target) => (
        <SelectionTargetButton key={target.label} target={target} picked={shown.picked} controls={{ hold: setHeld, done: finish }} />
      ))}
      {extraNode}
    </SelectionBox>
  );
}
