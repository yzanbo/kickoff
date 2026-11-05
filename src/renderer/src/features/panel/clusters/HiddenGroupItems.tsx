import { Check, ChevronRight } from "lucide-react";
import { useProjects } from "@/stores/projects";
import { useGroupsOf } from "@/stores/groups";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem } from "@/ui/PopupMenu";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { parsePanelKey } from "@/features/panel/surfaces";
import { specOf } from "@/features/panel/tabs/tabKinds";
import type { PanelController } from "@/features/panel/usePanel";
import { useHiddenTabGroups } from "./useHiddenTabGroups";

/** 欄のプロジェクト（プロジェクトの欄ならそのプロジェクトと、タブのプロジェクト） */
function panelProjectIds(panel: PanelController): number[] {
  const scope = parsePanelKey(panel.key)?.scope;
  const own = panel.surface !== "agents" && typeof scope === "number" ? [scope] : [];
  return [...new Set([...own, ...panel.tabs.flatMap((t) => specOf(t).projectOf(t) ?? [])])];
}

/**
 * タブの列の「表示」のメニューの、グループ別のときの項目: 「表示するグループ ▸」（自分で作ったグループを 1 つずつ隠す・出す。
 * 続けて切り替えられるよう、押してもメニューを閉じない）と「チャットのないグループを隠す」。No Group は隠せない
 */
export function HiddenGroupItems({ panel }: { panel: PanelController }) {
  const projectIds = panelProjectIds(panel);
  const groupsOf = useGroupsOf(projectIds);
  const { projectName } = useProjects();
  const many = projectIds.length > 1;
  const groups = projectIds.flatMap((id) => groupsOf(id).map((group) => ({ group, label: many ? `${projectName(id)} · ${group.name}` : group.name })));
  const hidden = useHiddenTabGroups();
  const submenu = useSubmenu();
  const hiddenHere = groups.filter((g) => hidden.hidden.has(g.group.id));
  return (
    <>
      <div className="menu-label">グループ（タブの列）</div>
      {groups.length > 0 && (
        <button {...submenu.trigger} title={`タブの列に出すグループを選びます（${NO_GROUP_LABEL} はいつも出します）`}>
          <span className="project-switch-item">表示するグループ</span>
          <span className="menu-submenu-note">{hiddenHere.length > 0 ? `${hiddenHere.length} 件を隠し中` : "すべて"}</span>
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
      )}
      {submenu.anchor && (
        <MenuFlyout anchor={submenu.anchor} label="表示するグループ" onBack={submenu.back}>
          {groups.map(({ group, label }) => {
            const on = !hidden.hidden.has(group.id);
            return (
              <MenuItem
                key={group.id}
                role="menuitemcheckbox"
                checked={on}
                keepOpen
                title={on ? `「${group.name}」の札とタブを、タブの列から隠す（チャットはそのまま）` : `「${group.name}」をタブの列に表示する`}
                onSelect={() => hidden.toggle(group.id)}
              >
                <span className="project-switch-item">{label}</span>
                {on && <Check size={14} aria-hidden />}
              </MenuItem>
            );
          })}
          {hiddenHere.length > 0 && (
            <>
              <div className="menu-separator" role="separator" />
              <MenuItem keepOpen onSelect={() => hidden.show(hiddenHere.map((g) => g.group.id))}>
                すべて表示
              </MenuItem>
            </>
          )}
        </MenuFlyout>
      )}
      <MenuItem
        role="menuitemcheckbox"
        checked={hidden.hideEmpty}
        title={`チャットが 1 つもないグループの札を、タブの列に出しません（${NO_GROUP_LABEL} は出します。チャットを入れると出ます）`}
        onSelect={() => hidden.setHideEmpty(!hidden.hideEmpty)}
      >
        <span className="project-switch-item">チャットのないグループを隠す</span>
        {hidden.hideEmpty && <Check size={14} aria-hidden />}
      </MenuItem>
    </>
  );
}
