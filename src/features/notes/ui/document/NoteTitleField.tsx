import { isCancelKey, isComposing, isKey } from "@/foundation/ui/lib/keys";
import { noteExtensionOf } from "@shared/notes/kinds";
import { parentOf } from "@/features/notes/ui/notePaths";
import type { useNoteEditMenu } from "./useNoteEditMenu";

const TITLE_MAX = 120; // 題名の欄に書ける長さ（文字）

/**
 * 開いたノートの見出しの題名の欄（すぐ後ろに拡張子を続け、ファイル名と同じに見せる。その後ろにフォルダ）。いつでも書き換えられる欄
 * （押せばそのままキャレットが入る。入力の画面に切り替えない）で、⌘S・Enter で onSave（本文を保存してから名前を変える）、Esc で元の題名に戻す。
 * 右クリックは本文と同じメニュー（切り取り・貼り付けはこの欄に効く。何も選んでいなければ、コピーは題名の全体）
 */
export function NoteTitleField({
  path,
  title,
  savedTitle,
  onTitle,
  onSave,
  editMenu,
}: {
  path: string;
  title: string;
  savedTitle: string;
  onTitle: (next: string) => void;
  onSave: () => void;
  editMenu: Pick<ReturnType<typeof useNoteEditMenu>, "openFor">;
}) {
  const extension = noteExtensionOf(path);
  const folder = parentOf(path);
  return (
    <div className="note-head-title">
      <input
        className="note-title"
        value={title}
        maxLength={TITLE_MAX}
        spellCheck={false}
        aria-label="ノートの名前（⌘S で保存）"
        title={`${path}（書き換えて ⌘S で名前を変える）`}
        onChange={(e) => onTitle(e.target.value)}
        onContextMenu={(e) => {
          e.preventDefault();
          const input = e.currentTarget;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? start;
          const value = input.value;
          editMenu.openFor(
            { x: e.clientX, y: e.clientY },
            {
              text: value.slice(start, end),
              copyAll: value,
              insert: (text) => {
                onTitle((value.slice(0, start) + text.replace(/\s*\n\s*/g, " ") + value.slice(end)).slice(0, TITLE_MAX));
                input.focus();
              },
            },
          );
        }}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          if (isKey(e, "s", { meta: true }) || isKey(e, "s", { ctrl: true }) || isKey(e, "Enter")) {
            e.preventDefault();
            onSave();
          } else if (isCancelKey(e) && title !== savedTitle) {
            // 元の題名に戻す（右の欄を閉じる Esc には渡さない）
            e.preventDefault();
            e.stopPropagation();
            onTitle(savedTitle);
          }
        }}
      />
      {extension && <span className="note-title-ext">{extension}</span>}
      {folder && <span className="note-head-folder">{folder}</span>}
    </div>
  );
}
