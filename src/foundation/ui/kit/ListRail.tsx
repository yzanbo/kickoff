import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconButton } from "./IconButton";

/**
 * タブの中の左の一覧を隠している間に、左端に置く細い帯（一覧を表示に戻すボタンだけ）。
 * 中身を開いていなくても戻せるように、一覧の代わりにいつも置く。隠すボタンは一覧の見出しの右端に `ListHideButton` で置く
 */
export function ListRail({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <div className="list-rail">
      <IconButton icon={PanelLeftOpen} label={label} onClick={onShow} />
    </div>
  );
}

/** 一覧を隠すボタン（一覧の見出しの右端に置く。アイコンの大きさは見出しのほかのボタンに合わせる） */
export function ListHideButton({ label, onHide, size }: { label: string; onHide: () => void; size?: number }) {
  return <IconButton icon={PanelLeftClose} size={size} label={label} onClick={onHide} />;
}
