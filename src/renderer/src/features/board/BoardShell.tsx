import type { ReactNode } from "react";
import type { Run } from "@shared/types";
import { cx } from "@/lib/cx";
import type { useRunRename } from "@/features/chat/useChatRename";
import { useProjects } from "@/app/projectsContext";
import { ErrorText } from "@/ui/ErrorText";
import { CardMenu } from "@/features/chat/ChatMenu";
import { SidePanel } from "@/features/panel/Panel";
import { terminalTargets, type SidePanelController } from "@/features/panel/usePanel";
import { useBoardHeaderLayout } from "./boardHeaderLayout";
import type { useCardMenu } from "./useBoardCards";
import { useBoardHeaderLayoutMenu } from "./useBoardHeaderLayoutMenu";

/**
 * ボード（カンバン・グループ）の共通の外枠: 見出し → 失敗の文 → ボードの中身と右側のパネル → カードの右クリックメニュー。
 * children はボードの中身（board-main の中）。after はほかのメニューなど、いちばん後ろに描くもの。
 * 見出しの置き方が beside なら、見出しと失敗の文をボードの側（パネルの左）に入れ、パネルを上端まで伸ばす
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
  const [headerLayout] = useBoardHeaderLayout();
  const layoutMenu = useBoardHeaderLayoutMenu();
  const beside = headerLayout === "beside";
  // 見出しの右クリックで置き方を切り替える（入力欄の上ではふつうの右クリック＝貼り付けなどを残す）
  const top = (
    <div
      className="board-top"
      onContextMenu={layoutMenu.open}
    >
      {header}
      <ErrorText message={error} className="board-error" />
    </div>
  );
  const main = <div className="board-main">{children}</div>;
  return (
    <div className={cx("board", className)}>
      {!beside && top}
      <div {...panel.body}>
        {beside ? (
          <div className="board-side">
            {top}
            {main}
          </div>
        ) : (
          main
        )}
        <SidePanel panel={panel} onNewChat={onNewChat} terminals={terminalTargets(projects, projectId)} />
      </div>
      {after}
      {layoutMenu.menu}
      {menu.at && <CardMenu {...menu.at} onOpenPanel={onOpenRun} onRename={rename.start} onClose={menu.close} onError={onError} />}
    </div>
  );
}
