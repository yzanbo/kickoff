import { ChevronDown, StickyNote } from "lucide-react";
import { useEffect } from "react";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { addToMemo, type MemoAddMode } from "./addToMemo";
import { MemoModeItems } from "./MemoMenuItems";

/** ボタンを押したときに、外側のクリックとして閉じないためのセレクタ（押すたびに開閉する） */
const BUTTON_SELECTOR = ".selection-memo";

/**
 * 文を選んだときの上のボタンの「メモ ▾」（足す先のボタンの横）。text は選択部分（返答は Markdown に戻したもの）、chatId はメモの出どころのチャット
 * （新しいメモの名前「<チャット名> チャットメモ<n>」）。押してもすぐにはメモにせず、下にメモへの入れ方のメニューを開く
 * （発言の右クリックと同じ MemoModeItems: 新しいメモ = そのままメモにする・AI で要約してメモにする / 既存のメモ = 追記する ▸・AI で組み込んで書き直す ▸）。
 * メニューを開いている間は onHold(true)（選んだ範囲の上のボタンを、外側のクリック・選び直しで消さない）。メモにしたら onDone
 */
export function SelectionMemoButton({
  projectId,
  chatId,
  text,
  onHold,
  onDone,
}: {
  projectId: number;
  chatId: number;
  text: string;
  onHold: (hold: boolean) => void;
  onDone: () => void;
}) {
  const menu = useContextMenu<true>({ gap: 6 });
  useEffect(() => onHold(menu.isOpen), [menu.isOpen, onHold]);
  const add = (mode: MemoAddMode, target: string | null) => {
    void addToMemo({ projectId, chatId, text, mode, target });
    onDone();
  };
  return (
    <>
      <button
        type="button"
        className="btn selection-attach-button selection-memo"
        title="選択部分をメモにする（新しいメモにするか、既存のメモに足すかを選ぶ）"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        // 押してもピントが移って選択が消えないように
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => menu.toggle(e, true)}
      >
        <StickyNote size={13} aria-hidden />
        メモ
        <ChevronDown size={13} aria-hidden className="selection-memo-chevron" />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="メモへの追加" ignore={BUTTON_SELECTOR} onClose={menu.close}>
          <MemoModeItems projectId={projectId} onAdd={add} />
        </PopupMenu>
      )}
    </>
  );
}
