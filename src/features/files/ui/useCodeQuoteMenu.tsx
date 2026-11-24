import type { MouseEvent, ReactNode } from "react";
import { ClipboardItems } from "@/foundation/ui/kit/ClipboardItems";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { HandOffItems, pickedInCode, type PickedCode } from "@/features/attachments/ui";
import { useMainChat } from "@/features/chat/ui";
import { codeSelectionOf } from "@/foundation/ui/code/codeSelection";

/** 開いたときの様子: 選んだ行の引用（なければ空）・ファイルのフルパス・コピーする文・選んだ行のコードと行（パスを含めてコピー。行を選んでいなければ null） */
interface CodeMenuSource {
  quote: string;
  path: string;
  copy: string;
  code: PickedCode["code"] | null;
}

/**
 * 右の欄・別ウィンドウの「変更」の差分・「ファイル」の中身の行（`[data-quote-path]` の中）の右クリックのメニュー: 「AI に渡す」の渡し先（HandOffItems。
 * 選んでいれば、パスと行番号付きのコードの引用を新しいチャット・このチャット・子チャットなどへ。いつも「パスをこのチャットに追加」= dir からのフルパス）と「クリップボード」の組
 * （ClipboardItems: コピー・パスを含めてコピー（行を選んでいれば `パス:12-14` と行のコード）・パスをコピー）。
 * 右の欄・別ウィンドウの外（ファイルタブなど）では何もしない（ブラウザの既定のまま）。inSide はメニューを出すか（編集の部品の右クリックのメニューを出さない所）
 */
export function useCodeQuoteMenu({ projectId, dir }: { projectId: number; dir: string | undefined }): {
  inSide: boolean;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  element: ReactNode;
} {
  const inSide = useMainChat() !== null;
  const menu = useContextMenu<CodeMenuSource>();
  const shown = menu.menu;
  return {
    inSide,
    onContextMenu: inSide
      ? (e) => {
          // 見出しなど、自分のメニューを出す所は任せる
          if (e.defaultPrevented) return;
          const section = (e.target as Element).closest<HTMLElement>("[data-quote-path]");
          const rel = section?.dataset.quotePath;
          if (!section || !rel || !e.currentTarget.contains(section)) return;
          const picked = pickedInCode(section);
          // 編集の部品（Monaco）の選択はページの選択にならないので、部品から選んだ文を読む
          const copy = codeSelectionOf(section)?.text ?? window.getSelection()?.toString() ?? "";
          menu.open(e, { quote: picked?.quote ?? "", path: dir ? `${dir}/${rel}` : rel, copy, code: picked?.code ?? null });
        }
      : undefined,
    element: shown && (
      <PopupMenu at={shown.at} label="コードの操作" onClose={menu.close}>
        <HandOffItems item={{ projectId, what: "選んだ行の引用", text: shown.value.quote, path: shown.value.path }} />
        <div className="menu-separator" role="separator" />
        <ClipboardItems text={shown.value.copy} selection={shown.value.code?.text ?? shown.value.copy} path={shown.value.path} lines={shown.value.code?.lines ?? null} />
      </PopupMenu>
    ),
  };
}
