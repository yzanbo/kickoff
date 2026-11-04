import { Check, type LucideIcon } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";

/**
 * パネルのタブの列のブラウザ・ターミナルの ▾ のメニュー: 新しいタブで開く・「外部で開く」の見出しの下にこの Mac のアプリの一覧。
 * アプリを押すと、そのアプリでそのまま開く（次からの既定にもなり、チェックはいちばん最後に使ったアプリ。
 * ブラウザのアドレス欄の横の「〜で開く」もこのアプリを使う）。以前は「外部で開く」と「外で開くアプリ」（選ぶだけで開かない）が分かれていた
 */
export function OpenWithMenu<T extends string>({
  at,
  ignore,
  icon: Icon,
  title,
  newTab,
  apps,
  current,
  onNewTab,
  onOpenIn,
  onClose,
}: {
  /** 置く場所（▾ の右端にそろえて、その下） */
  at: Placement;
  ignore: string;
  icon: LucideIcon;
  /** メニューの名前（aria-label） */
  title: string;
  /** 「新しいタブで開く」の文 */
  newTab: string;
  apps: { id: T; label: string; missing?: boolean }[];
  current: T;
  onNewTab: () => void;
  /** そのアプリで開く（次からの既定にもする） */
  onOpenIn: (app: T) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu at={at} className="open-with-menu" label={title} ignore={ignore} onClose={onClose}>
      <MenuItem onSelect={onNewTab}>
        <Icon size={14} aria-hidden /> {newTab}
      </MenuItem>
      <div className="menu-separator" role="separator" />
      <div className="menu-label">外部で開く</div>
      {apps.map((a) => (
        <MenuItem
          key={a.id}
          role="menuitemradio"
          checked={a.id === current}
          title={a.missing ? "この Mac に見つかりません" : a.id === current ? "最後に使ったアプリ（ブラウザのアドレス欄の「〜で開く」もこれを使う）" : undefined}
          onSelect={() => onOpenIn(a.id)}
        >
          <span className="project-switch-item">
            {a.label}
            {a.missing ? "（見つかりません）" : ""}
          </span>
          {a.id === current && <Check size={14} aria-hidden />}
        </MenuItem>
      ))}
    </PopupMenu>
  );
}
