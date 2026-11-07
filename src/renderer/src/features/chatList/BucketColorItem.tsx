import { Check } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import type { Setting } from "@/lib/storage";
import { MenuItem } from "@/ui/PopupMenu";

/**
 * メニューの「まとまりを色付きで表示」（グループ別・作業場所別のまとまりに色を付けるか。サイドバーは SIDEBAR_BUCKET_COLORS、
 * タブの列は PANEL_TAB_GROUP_COLORS）。まとめ方のメニュー・まとまりの見出しや札の右クリックで同じ項目を出す。色はどちらも bucketHues.ts で同じ
 */
export function BucketColorItem({ setting, keepOpen = false }: { setting: Setting<boolean>; keepOpen?: boolean }) {
  const [on, setOn] = useSetting(setting);
  return (
    <MenuItem
      role="menuitemcheckbox"
      checked={on}
      keepOpen={keepOpen}
      title={on ? "まとまりの色を消して、色なしで表示します" : "グループ別・作業場所別のまとまりに色を付けます（サイドバーとタブの列で同じ色）"}
      onSelect={() => setOn(!on)}
    >
      <span className="project-switch-item">まとまりを色付きで表示</span>
      {on && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}
