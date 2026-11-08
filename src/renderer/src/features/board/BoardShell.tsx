import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import type { useChatRename } from "@/features/chat/useChatRename";
import { ErrorText } from "@/ui/ErrorText";
import { ChatMenu } from "@/features/chat/ChatMenu";
import { Panel } from "@/features/panel/Panel";
import type { useBoardPanel } from "@/features/panel/board/useBoardPanel";
import type { useCardMenu } from "./useBoardCards";

/**
 * ボード（カンバン・グループ）の共通の外枠: 保存したビューのタブ（カンバンだけ）→ 見出し → 失敗の文 → ボードの中身と右側のパネル → カードの右クリックメニュー。
 * children はボードの中身（board-main の中）。after はほかのメニューなど、いちばん後ろに描くもの。
 * 右のパネル（rightPanel）はプロジェクトのボードだけ（全プロジェクトのボードは、チャットをそのプロジェクトへ移って開くので持たない）。
 * 見出しはいつも横幅いっぱいの上に置き、右のパネルはその下から始まる（パネルがボードを覆っても見出しは見える）
 */
export function BoardShell({
  className,
  views,
  header,
  error,
  rightPanel,
  menu,
  onOpenChat,
  rename,
  onError,
  after,
  children,
}: {
  className?: string;
  /** ツールバーの上に置く、保存したビューのタブ（SavedViewTabs。カンバンだけ） */
  views?: ReactNode;
  /** BoardHeader */
  header: ReactNode;
  error?: string;
  /** 右のパネル（useBoardPanel。プロジェクトのボードだけ） */
  rightPanel?: ReturnType<typeof useBoardPanel>;
  menu: ReturnType<typeof useCardMenu>;
  /** メニューの「開く」 */
  onOpenChat: (chat: Chat) => void;
  rename: ReturnType<typeof useChatRename>;
  onError: (message: string) => void;
  after?: ReactNode;
  children: ReactNode;
}) {
  const main = <div className="board-main">{children}</div>;
  return (
    <div className={cx("board", className)}>
      {views}
      {header}
      <ErrorText message={error} className="board-error" />
      {rightPanel ? (
        <div {...rightPanel.body}>
          {main}
          <Panel panel={rightPanel.panel} frame={rightPanel.frame} />
        </div>
      ) : (
        <div className="board-body">{main}</div>
      )}
      {after}
      {menu.menu && <ChatMenu at={menu.menu.at} chat={menu.menu.value} onOpenPanel={onOpenChat} onRename={rename.start} onClose={menu.close} onError={onError} />}
    </div>
  );
}
