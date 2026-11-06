import { Check } from "lucide-react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { useSetting } from "@/hooks/useSetting";
import { COMPOSER_COMPACT } from "@/lib/storageKeys";
import { ClipboardItems } from "@/ui/ClipboardItems";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/** 右クリックしたときの選択範囲と、その文 */
interface Picked {
  start: number;
  end: number;
  text: string;
}

/** 押すと閉じない操作の上（下の道具の行の何もないところ以外）では、チャット欄のメニューを開かない */
const CONTROL_SELECTOR = "button, a, input, select, textarea, [role=button], [role=menu]";

/**
 * チャット欄の右クリックのメニュー（文を書く欄と、下の道具の行の何もないところ）: 「クリップボード」の組（切り取り・コピー・貼り付け。
 * 右クリックしたときの文を書く欄の選択範囲に効く）と、その下に呼ぶ側の項目（items。定型文の帯の表示の切り替えなど）、いちばん下に
 * 「チャット欄をコンパクトに」（COMPOSER_COMPACT。どのチャット欄でも同じ。設定の「表示」→「チャット欄」と同じ）。
 * 書き換えは入力と同じ扱いの execCommand で入れ、⌘Z で戻せるようにする（React の onChange にも届く）。使えなければ setText で入れる
 */
export function useComposerTextMenu({
  textareaRef,
  setText,
  items,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  setText: (text: string) => void;
  items?: ReactNode;
}): {
  onContextMenu: (e: MouseEvent<HTMLTextAreaElement>) => void;
  /** 下の道具の行の右クリック（ボタン・選択欄の上は、そのものに任せる） */
  onBarContextMenu: (e: MouseEvent<HTMLElement>) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<Picked>();
  const [compact, setCompact] = useSetting(COMPOSER_COMPACT);
  const replace = ({ start, end }: Picked, value: string) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    if (!document.execCommand(value ? "insertText" : "delete", false, value)) setText(el.value.slice(0, start) + value + el.value.slice(end));
  };
  const picked = menu.menu?.value;
  const open = (e: MouseEvent) => {
    const el = textareaRef.current;
    if (!el) return;
    menu.open(e, { start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) });
  };
  return {
    onContextMenu: open,
    onBarContextMenu: (e) => {
      if (e.defaultPrevented || (e.target as Element).closest(CONTROL_SELECTOR)) return;
      open(e);
    },
    element: menu.menu && picked && (
      <PopupMenu at={menu.menu.at} label="入力欄" onClose={menu.close}>
        <ClipboardItems text={picked.text} path={null} onCut={() => replace(picked, "")} onPaste={(text) => replace(picked, text)} />
        <div className="menu-separator" role="separator" />
        {items}
        <MenuItem
          role="menuitemcheckbox"
          checked={compact}
          title="チャット欄の文字・余白・下のボタンを小さくして、縦の幅を抑えます（どのチャット欄でも同じです。設定の「表示」・タブの列の「表示」でも切り替えられます）"
          onSelect={() => setCompact(!compact)}
        >
          <span className="project-switch-item">チャット欄をコンパクトに</span>
          {compact && <Check size={14} aria-hidden />}
        </MenuItem>
      </PopupMenu>
    ),
  };
}
