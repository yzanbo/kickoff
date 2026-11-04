import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import type { useChatRename } from "@/features/chat/useChatRename";
import { useProjects } from "@/stores/projects";
import { ErrorText } from "@/ui/ErrorText";
import { ChatMenu } from "@/features/chat/ChatMenu";
import { Panel } from "@/features/panel/Panel";
import { terminalTargets, type PanelController } from "@/features/panel/usePanel";
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
  onOpenChat,
  rename,
  onError,
  after,
  children,
}: {
  className?: string;
  /** BoardHeader */
  header: ReactNode;
  error?: string;
  panel: PanelController;
  /** タブの列の＋の「新しいチャット」 */
  onNewChat: () => void;
  /** ターミナルの開く場所（プロジェクトのボードはそのプロジェクトの本体。未指定なら全プロジェクト） */
  projectId?: number;
  menu: ReturnType<typeof useCardMenu>;
  /** メニューの「開く」 */
  onOpenChat: (chat: Chat) => void;
  rename: ReturnType<typeof useChatRename>;
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
        <Panel panel={panel} onNewChat={onNewChat} terminals={terminalTargets(projects, projectId)} />
      </div>
      {after}
      {layoutMenu.menu}
      {menu.at && <ChatMenu {...menu.at} onOpenPanel={onOpenChat} onRename={rename.start} onClose={menu.close} onError={onError} />}
    </div>
  );
}
