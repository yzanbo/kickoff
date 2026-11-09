import { Check, Folder, FolderPlus, Inbox } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import { useGroups } from "@/stores/groups";
import { MenuFlyout } from "@/ui/MenuFlyout";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";

/**
 * メニューの項目の横に開く、グループを選ぶ一覧（チャットの右クリックの「グループを変更」）:
 * そのプロジェクトのグループ（サイドバーと同じ並び）と「No Group」（いまのグループにチェック）、区切り線の下に「新しいグループを作成…」。
 * 置き場所・↑↓・← で戻るは MenuFlyout
 */
export function GroupPickFlyout({
  anchor,
  projectId,
  current,
  onPick,
  onCreate,
  onBack,
}: {
  /** 開いた項目（この横に出す。右に入らなければ左） */
  anchor: HTMLElement;
  projectId: number;
  /** いまのグループ（null はグループなし。チェックを付け、選んでも何もしない） */
  current: number | null;
  onPick: (group: ChatGroup | null) => void;
  /** 新しいグループを作って、そこへ移す */
  onCreate: () => void;
  onBack: () => void;
}) {
  const groups = useGroups(projectId);
  const pick = (group: ChatGroup | null) => ((group?.id ?? null) === current ? onBack() : onPick(group));
  const item = (group: ChatGroup | null, first: boolean) => {
    const on = (group?.id ?? null) === current;
    return (
      <button key={group?.id ?? "none"} role="menuitemradio" aria-checked={on} autoFocus={first} className={group ? undefined : "muted-item"} onClick={() => pick(group)}>
        {group ? <Folder size={14} aria-hidden /> : <Inbox size={14} aria-hidden />}
        <span className="project-switch-item">{group?.name ?? NO_GROUP_LABEL}</span>
        {on && <Check size={14} className="project-pick-check" aria-hidden />}
      </button>
    );
  };
  return (
    <MenuFlyout anchor={anchor} label="移動先のグループ" className="project-pick" onBack={onBack}>
      <div className="project-pick-list">
        {groups.map((g, i) => item(g, i === 0))}
        {item(null, groups.length === 0)}
      </div>
      <div className="menu-separator" role="separator" />
      <button role="menuitem" onClick={onCreate}>
        <FolderPlus size={14} aria-hidden /> 新しいグループを作成…
      </button>
    </MenuFlyout>
  );
}
