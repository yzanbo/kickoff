import { ArchiveRestore, Settings } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { ChoiceMenu } from "@/foundation/ui/kit/ChoiceMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { cx } from "@/foundation/ui/lib/cx";
import { ToneChip } from "@/foundation/ui/kit/ToneChip";
import { confirmRestoreProject } from "@/features/projects/ui/projectOrder";
import type { ProjectViewId } from "@/foundation/ui/navigation/router";
import { WindowHeaderContent } from "@/foundation/ui/shell/WindowHeaderContent";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { ProjectTabs, useProjectTabsLayout, type TabBadgeSource } from "./ProjectTabs";
import { StateStats } from "./StateStats";
import { AllStateChats } from "./AllStateChats";
import { useAllWaiting } from "@/features/chatList/ui/activeChats/useAllWaiting";
import { NO_CHATS, useChatsWithChildrenByProject } from "@/features/chat/ui/store/knownChats";
import type { ProjectData } from "./useProjectData";
import { PROJECT_HEADER_MODE_LABELS, PROJECT_HEADER_MODES, useProjectHeaderMode } from "./headerMode";

/**
 * プロジェクト画面の見出し: 名前（プロジェクトの切り替え）・設定の歯車・しまったものを戻す・状態ごとのチャット数・すべてのプロジェクトの状態ごとのチャット（AllStateChats）と、
 * タブの列（チャットの件数、変更は変更のあるファイルの数。左に縦並びにする設定のときは、見出しには出さない）。
 * 名前の行の出し方（表示 / 上端に寄せたときだけ表示 / 非表示。useProjectHeaderMode）は、名前の行の右クリックと設定の「表示」で選ぶ（下の帯と同じ）。
 * 寄せたときだけ表示は、画面の上に重ねて出し（縦の幅を取らない）、乗せている間・中のメニューや一覧を開いている間は出したまま（.project-title-row.auto-hide）
 */
export function ProjectHeader({
  data,
  tab,
  badge,
  onEdit,
}: {
  data: ProjectData;
  tab: ProjectViewId;
  badge: TabBadgeSource;
  onEdit: () => void;
}) {
  const { project } = data;
  const [layout] = useProjectTabsLayout();
  // 状態ごとの数は、このプロジェクトのチャット（子チャットも数える）
  const counted = useChatsWithChildrenByProject()[project.id] ?? NO_CHATS;
  // 一覧のボタンの右上の要対応の数は、すべてのプロジェクトのもの（ほかのプロジェクトに要対応があるかを見るため）
  const waiting = useAllWaiting();
  const [mode, setMode] = useProjectHeaderMode();
  const menu = useContextMenu();
  // 名前の行もタブの列もなければ、見出しごと出さない（非表示でタブを左に縦並びにしているとき）
  if (mode === "hide" && layout !== "top") return null;
  return (
  <header className={cx("page-header project-header", mode !== "show" && "title-out")}>
    {mode !== "hide" && (
    <WindowHeaderContent>
    <div className={cx("project-title-row", mode === "hover" && "auto-hide")} onContextMenu={menu.open}>
      <h1>
        <ProjectSwitcher project={project} tab={tab} />
      </h1>
      {/* プロジェクトの設定（名前・既定の設定などの編集）。左下のアプリの設定と同じ歯車 */}
      <IconButton icon={Settings} label="プロジェクトの設定" title="プロジェクトの設定（名前・既定の設定などを編集）" className="project-edit-button" onClick={onEdit} />
      {/* しまった（アーカイブした）プロジェクト: サイドバーに出ないので、ここから戻せるようにする */}
      {project.archived_at && (
        <button
          className="btn"
          data-size="sm"
          title="アーカイブから戻す（サイドバー・全プロジェクトの画面に出す）"
          onClick={() => void confirmRestoreProject(project)}
        >
          <ArchiveRestore size={13} /> 戻す
        </button>
      )}
      <div className="project-stats">
        {project.archived_at && <ToneChip label="アーカイブ済み" />}
        <StateStats chats={counted} />
        {/* すべてのプロジェクトの状態ごとのチャット（左の数と同じ一覧を「すべてのプロジェクト」から開く。状態ごとの数が 0 でも出す。右上にすべてのプロジェクトの要対応の数） */}
        <AllStateChats project={project} waiting={waiting} />
      </div>
    </div>
    </WindowHeaderContent>
    )}
    {menu.menu && (
      <ChoiceMenu
        at={menu.menu.at}
        title="プロジェクトの見出し"
        values={PROJECT_HEADER_MODES}
        labels={PROJECT_HEADER_MODE_LABELS}
        titles={{ hide: "戻すときは、設定（⌘,）の「表示」→「プロジェクトの見出し」から" }}
        value={mode}
        onPick={setMode}
        onClose={menu.close}
      />
    )}
    {layout === "top" && (
      <div className="project-tabs-row">
        <ProjectTabs projectId={project.id} tab={tab} badge={badge} />
      </div>
    )}
  </header>
  );
}
