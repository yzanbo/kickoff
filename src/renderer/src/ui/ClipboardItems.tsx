import { lineLocation, textWithPath } from "@/lib/pathCopy";
import { reportFailure } from "./dialogs";
import { MenuItem } from "./PopupMenu";

const copy = (text: string) => navigator.clipboard.writeText(text).catch(reportFailure("コピーできませんでした"));

/**
 * 右クリックのメニューの、見出し「クリップボード」の組: 切り取り（onCut を渡したとき）・コピー・パスを含めてコピー・パスをコピー・貼り付け（onPaste を渡したとき）。
 * text = コピーする文（空なら押せない）、selection = パスを含めてコピーする選択部分（既定は text。題名の欄の全体のように、選んでいない文は含めない）、
 * path = ファイルのフルパス（null ならパスの 2 つを出さない）、lines = 選択部分の行（分かれば `パス:12-14` にする）
 */
export function ClipboardItems({
  text,
  selection = text,
  path,
  lines = null,
  onCut,
  onPaste,
}: {
  text: string;
  selection?: string;
  path: string | null;
  lines?: { from: number; to: number } | null;
  onCut?: () => void;
  onPaste?: (text: string) => void;
}) {
  return (
    <>
      <div className="menu-label">クリップボード</div>
      {onCut && (
        <MenuItem disabled={!text} onSelect={() => void navigator.clipboard.writeText(text).then(onCut, reportFailure("切り取れませんでした"))}>
          切り取り
        </MenuItem>
      )}
      <MenuItem disabled={!text} onSelect={() => void copy(text)}>
        コピー
      </MenuItem>
      {path && (
        <>
          <MenuItem
            disabled={!selection.trim()}
            title="選択部分の前に、ファイルのフルパス（分かれば行番号も）を付けてコピーします"
            onSelect={() => void copy(textWithPath(lineLocation(path, lines), selection))}
          >
            パスを含めてコピー
          </MenuItem>
          <MenuItem title="ファイルのフルパスをコピーします" onSelect={() => void copy(path)}>
            パスをコピー
          </MenuItem>
        </>
      )}
      {onPaste && (
        <MenuItem onSelect={() => void navigator.clipboard.readText().then(onPaste, reportFailure("貼り付けられませんでした"))}>
          貼り付け
        </MenuItem>
      )}
    </>
  );
}
