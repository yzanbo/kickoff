import { Fragment, type MutableRefObject, type ReactNode } from "react";
import { ClipboardItems } from "@/ui/ClipboardItems";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { MemoLines } from "./memoAttachment";
import type { MemoEditorHandle } from "./MemoEditor";

/**
 * 開いたときの様子: text = 選んでいた文、lines = 選んでいた行（本文の編集の部品のときだけ。ほかは null）、insert = 書ける所なら選んでいた範囲を置き換える関数（null なら書けない。
 * HTML のメモのページの表示は書けないので、切り取り・貼り付けを出さない）、copyAll = 何も選んでいないときにコピーする文（題名の欄は題名の全体）
 */
interface MemoMenuSource {
  text: string;
  lines?: MemoLines | null;
  insert: ((text: string) => void) | null;
  copyAll?: string;
}

/** メモを足す先のチャット（メインのチャット・メモのチャット）。選んでいれば、その部分の引用を足し、なければメモ全体を添付する。path なら、メモのパスを足す */
export interface MemoChatTarget {
  add: (selection: string, lines: MemoLines | null) => void;
  addPath: () => void;
}

/** 足す先ごとの見出し */
const TARGET_NAMES = { main: "メインのチャット", memo: "メモのチャット" } as const;

/**
 * メモの本文の右クリックのメニュー。足す先ごとに見出しを付けて組に分ける: メインのチャット（main を渡したとき。チャットの右の欄・別ウィンドウのメモ）・メモのチャット。
 * それぞれ「選択部分を追加」（選んでいなければ「メモを添付」）と「パスを追加」。送るのは自分で。
 * その下に「クリップボード」の組（ClipboardItems: 切り取り・コピー・パスを含めてコピー・パスをコピー・貼り付け。file = メモのファイルのフルパス）。
 * 文を選んだだけではチャットに足さない（右クリックで選んだときだけ）。
 * HTML のメモのページの表示からは、選んだ文を渡して開く（チャットに足す項目と、切り取り・貼り付けのないクリップボードの組）。
 * 見出しの題名の欄からも同じメニューを開く（openFor。切り取り・貼り付けは題名の欄に効き、何も選んでいなければコピーは題名の全体。パスを含めてコピーは選んだ文だけ）
 */
export function useMemoEditMenu(
  editor: MutableRefObject<MemoEditorHandle | null>,
  targets: { main?: MemoChatTarget; memo: MemoChatTarget },
  file: string,
): {
  open: (at: { x: number; y: number }, pageSelection?: string) => void;
  openFor: (at: { x: number; y: number }, source: MemoMenuSource) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<MemoMenuSource>();
  const shown = menu.menu;
  const selected = shown?.value.text ?? "";
  const insert = shown?.value.insert ?? null;
  const copyText = selected || shown?.value.copyAll || "";
  return {
    // 開いたときに選んでいた文を覚える（メニューを押すまでに選択が変わっても、開いたときの文を使う）
    open: (at, pageSelection) =>
      menu.openAt(
        at,
        pageSelection === undefined
          ? { text: editor.current?.selectedText() ?? "", lines: editor.current?.selectedLines() ?? null, insert: (text) => editor.current?.insert(text) }
          : { text: pageSelection, insert: null },
      ),
    openFor: (at, source) => menu.openAt(at, source),
    element: shown && (
      <PopupMenu at={shown.at} label="メモの本文の操作" onClose={menu.close}>
        {(["main", "memo"] as const).map((key) => {
          const target = targets[key];
          if (!target) return null;
          const name = TARGET_NAMES[key];
          return (
            <Fragment key={key}>
              <div className="menu-label">{name}</div>
              <MenuItem
                title={selected.trim() ? `選択部分を、ファイルのパスと行番号付きの引用にして、${name}の入力欄に足します` : `このメモを、${name}の入力欄に添付します`}
                onSelect={() => target.add(selected, shown.value.lines ?? null)}
              >
                {selected.trim() ? "選択部分を追加" : "メモを添付"}
              </MenuItem>
              <MenuItem title={`このメモのファイルのフルパスを、${name}の入力欄に足します`} onSelect={target.addPath}>
                パスを追加
              </MenuItem>
              <div className="menu-separator" role="separator" />
            </Fragment>
          );
        })}
        <ClipboardItems
          text={copyText}
          selection={selected}
          path={file}
          lines={shown.value.lines ?? null}
          onCut={insert ? () => insert("") : undefined}
          onPaste={insert ?? undefined}
        />
      </PopupMenu>
    ),
  };
}
