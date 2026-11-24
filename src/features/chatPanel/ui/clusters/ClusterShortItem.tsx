import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/chatPanel/ui/storage";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";

/**
 * 「まとまりの名前を省略」（タブの列のまとまりの札の名前を頭の 1 文字だけにする。すべての欄で共通）。
 * 「表示」のメニューの「チャットのまとめ方」の下（keepOpen で閉じずに）と、札の右クリックに置く
 */
export function ClusterShortItem({ keepOpen = false }: { keepOpen?: boolean }) {
  const [on, setOn] = useSetting(storage.settings.clusterShort);
  return (
    <MenuItem
      checked={on}
      keepOpen={keepOpen}
      title={on ? "まとまりの札に名前をすべて出します" : "まとまりの札の名前を頭の 1 文字だけにして、タブの列を広く使います（乗せると名前が出ます）"}
      onSelect={() => setOn(!on)}
    >
      <span className="project-switch-item">まとまりの名前を省略</span>
    </MenuItem>
  );
}
