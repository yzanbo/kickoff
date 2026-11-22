import { ArrowDown, ArrowUp } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";

/** 並べ替えの ↑↓（行と印の線で同じ列。at はいまの位置、last はいちばん下の位置、what はボタンの名前の頭（「一時停止を 」など）） */
export function MoveButtons({ at, last, what = "", onMove }: { at: number; last: number; what?: string; onMove: (to: number) => void }) {
  return (
    <span className="queued-row-moves">
      <IconButton icon={ArrowUp} label={`${what}1 つ上へ移動`} iconSize={13} disabled={at === 0} onClick={() => onMove(at - 1)} />
      <IconButton icon={ArrowDown} label={`${what}1 つ下へ移動`} iconSize={13} disabled={at >= last} onClick={() => onMove(at + 1)} />
    </span>
  );
}

/** 右クリックの「いちばん上へ / 1 つ上へ / 1 つ下へ / いちばん下へ」（動けない向きは出さない） */
export function MoveMenuItems({ at, last, onMove }: { at: number; last: number; onMove: (to: number) => void }) {
  return (
    <>
      {at > 0 && <MenuItem onSelect={() => onMove(0)}>いちばん上へ移動</MenuItem>}
      {at > 0 && <MenuItem onSelect={() => onMove(at - 1)}>1 つ上へ移動</MenuItem>}
      {at < last && <MenuItem onSelect={() => onMove(at + 1)}>1 つ下へ移動</MenuItem>}
      {at < last && <MenuItem onSelect={() => onMove(last)}>いちばん下へ移動</MenuItem>}
    </>
  );
}
