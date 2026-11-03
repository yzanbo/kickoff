import { Check, ExternalLink, type LucideIcon } from "lucide-react";
import { MenuItem, PopupMenu } from "../PopupMenu";

/** メニューの幅（開く位置の計算と CSS で同じ値） */
export const OPEN_WITH_MENU_WIDTH = 240;

/** メニューのおおよその高さ（画面からはみ出さない位置にするため） */
export const openWithMenuHeight = (apps: number) => 100 + apps * 32;

/**
 * パネルのタブの列のブラウザ・ターミナルの ▾ のメニュー: 新しいタブで開く・選んでいる外のアプリで開く・外で開くアプリを選ぶ
 * （アプリを選んでも開かない。次から「〜で開く」とボタンの外のアプリに使う）
 */
export function OpenWithMenu<T extends string>({
  x,
  y,
  ignore,
  icon: Icon,
  title,
  newTab,
  externalApp,
  apps,
  current,
  onNewTab,
  onExternal,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  ignore: string;
  icon: LucideIcon;
  /** メニューの名前（aria-label） */
  title: string;
  /** 「新しいタブで開く」の文 */
  newTab: string;
  /** 外部で開くときのアプリの名前（項目の右に控えめに添える） */
  externalApp: string;
  apps: { id: T; label: string; missing?: boolean }[];
  current: T;
  onNewTab: () => void;
  onExternal: () => void;
  onPick: (app: T) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu x={x} y={y} className="open-with-menu" label={title} ignore={ignore} onClose={onClose}>
      <MenuItem onSelect={onNewTab}>
        <Icon size={14} aria-hidden /> {newTab}
      </MenuItem>
      <MenuItem onSelect={onExternal}>
        <ExternalLink size={14} aria-hidden />
        <span className="project-switch-item">外部で開く</span>
        <span className="menu-hint">{externalApp}</span>
      </MenuItem>
      <div className="menu-separator" role="separator" />
      <div className="menu-label">外で開くアプリ</div>
      {apps.map((a) => (
        <MenuItem key={a.id} role="menuitemradio" checked={a.id === current} title={a.missing ? "この Mac に見つかりません" : undefined} onSelect={() => onPick(a.id)}>
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
