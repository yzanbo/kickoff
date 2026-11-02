import type { ReactNode } from "react";
import type { Run } from "../../../../core/types";
import { cx } from "../../cx";
import type { useRunRename } from "../../hooks/useRunRename";
import { useProjects } from "../../projectsContext";
import { ErrorText } from "../ErrorText";
import { CardMenu } from "../menus/CardMenu";
import { SidePanel } from "../sidePanel/SidePanel";
import { terminalTargets, type SidePanelController } from "../sidePanel/useSidePanel";
import type { useCardMenu } from "./useBoardCards";

/**
 * ボード（カンバン・グループ）の共通の外枠: 見出し → 失敗の文 → ボードの中身と右側のパネル → カードの右クリックメニュー。
 * children はボードの中身（board-main の中）。after はほかのメニューなど、いちばん後ろに描くもの
 */
export function BoardShell({
  className,
  header,
  error,
  panel,
  onNewChat,
  projectId,
  menu,
  onOpenRun,
  rename,
  onError,
  after,
  children,
}: {
  className?: string;
  /** BoardHeader */
  header: ReactNode;
  error?: string;
  panel: SidePanelController;
  /** タブの列の＋の「新しいチャット」 */
  onNewChat: () => void;
  /** ターミナルの開く場所（プロジェクトのボードはそのプロジェクトの本体。未指定なら全プロジェクト） */
  projectId?: number;
  menu: ReturnType<typeof useCardMenu>;
  /** メニューの「開く」 */
  onOpenRun: (run: Run) => void;
  rename: ReturnType<typeof useRunRename>;
  onError: (message: string) => void;
  after?: ReactNode;
  children: ReactNode;
}) {
  const { projects } = useProjects();
  return (
    <div className={cx("board", className)}>
      {header}
      <ErrorText message={error} className="board-error" />
      <div {...panel.body}>
        <div className="board-main">{children}</div>
        <SidePanel panel={panel} onNewChat={onNewChat} terminals={terminalTargets(projects, projectId)} />
      </div>
      {after}
      {menu.at && <CardMenu {...menu.at} onOpenPanel={onOpenRun} onRename={rename.start} onClose={menu.close} onError={onError} />}
    </div>
  );
}
