import { ChevronDown, StickyNote } from "lucide-react";
import { useEffect } from "react";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { addToNote, type NoteAddMode } from "./addToNote";
import { NoteModeItems } from "./NoteMenuItems";

/** ボタンを押したときに、外側のクリックとして閉じないためのセレクタ（押すたびに開閉する） */
const BUTTON_SELECTOR = ".selection-note";

/**
 * 文を選んだときの上のボタンの「ノート ▾」（足す先のボタンの横）。text は選択部分（返答は Markdown に戻したもの）、chatId はノートの出どころのチャット
 * （新しいノートの名前「<チャット名> チャットノート<n>」）。押してもすぐにはノートにせず、下にノートへの入れ方のメニューを開く
 * （発言の右クリックと同じ NoteModeItems: 新しいノート = そのままノートにする・AI で要約してノートにする / 既存のノート = 追記する ▸・AI で組み込んで書き直す ▸）。
 * メニューを開いている間は onHold(true)（選んだ範囲の上のボタンを、外側のクリック・選び直しで消さない）。ノートにしたら onDone
 */
export function SelectionNoteButton({
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
  const add = (mode: NoteAddMode, target: string | null) => {
    void addToNote({ projectId, chatId, text, mode, target });
    onDone();
  };
  return (
    <>
      <button
        type="button"
        className="btn selection-attach-button selection-note"
        title="選択部分をノートにする（新しいノートにするか、既存のノートに足すかを選ぶ）"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        // 押してもピントが移って選択が消えないように
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => menu.toggle(e, true)}
      >
        <StickyNote size={13} aria-hidden />
        ノート
        <ChevronDown size={13} aria-hidden className="selection-note-chevron" />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="ノートへの追加" ignore={BUTTON_SELECTOR} onClose={menu.close}>
          <NoteModeItems projectId={projectId} onAdd={add} />
        </PopupMenu>
      )}
    </>
  );
}
