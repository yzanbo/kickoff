import { ChevronRight, Folder, FolderInput } from "lucide-react";
import type { ChatGroup } from "@shared/groups/types";
import type { Project } from "@shared/projects/types";
import { api } from "@/foundation/ui/api";
import { useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { askNewGroupName, GroupPickFlyout } from "@/features/groups/ui";
import { ProjectPickFlyout } from "@/features/projects/ui";

/**
 * 右クリックの「グループを変更」（チャットと下書きで共通）。乗せる・押す・→ で横にこのプロジェクトのグループの一覧を開く（メニューは閉じない）
 */
export function MoveToGroupItem({
  projectId,
  current,
  onPick,
  onCreate,
}: {
  projectId: number;
  /** いまのグループ（null はグループなし） */
  current: number | null;
  onPick: (group: ChatGroup | null) => void;
  /** 新しいグループを作って、そこへ移す（作るのは askNewGroup） */
  onCreate: () => void;
}) {
  const grouping = useSubmenu();
  return (
    <>
      <button {...grouping.trigger}>
        <Folder size={14} /> グループを変更
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {grouping.anchor && <GroupPickFlyout anchor={grouping.anchor} projectId={projectId} current={current} onPick={onPick} onCreate={onCreate} onBack={grouping.back} />}
    </>
  );
}

/**
 * 右クリックの「プロジェクトを変更」（チャットと下書きで共通）。乗せる・押す・→ で横にプロジェクトの一覧を開く（メニューは閉じない）
 */
export function MoveToProjectItem({
  current,
  onPick,
  onCreate,
}: {
  /** いまのプロジェクト */
  current: number;
  onPick: (project: Project) => void;
  /** 新しいプロジェクトを作って、そこへ移す（検索欄に書いた名前を渡す） */
  onCreate: (name: string) => void;
}) {
  const moving = useSubmenu();
  return (
    <>
      <button {...moving.trigger}>
        <FolderInput size={14} /> プロジェクトを変更
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {moving.anchor && <ProjectPickFlyout anchor={moving.anchor} current={current} onPick={onPick} onCreate={onCreate} onBack={moving.back} />}
    </>
  );
}

/** 新しいグループの名前を聞いて作る（「作成して移す」。やめたら null） */
export async function askNewGroup(projectId: number): Promise<ChatGroup | null> {
  const name = await askNewGroupName("作成して移す");
  return name ? api.createGroup(projectId, name) : null;
}
