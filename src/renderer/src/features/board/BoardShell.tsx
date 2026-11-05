import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import type { useChatRename } from "@/features/chat/useChatRename";
import { ErrorText } from "@/ui/ErrorText";
import { ChatMenu } from "@/features/chat/ChatMenu";
import { Panel } from "@/features/panel/Panel";
import type { useBoardPanel } from "@/features/panel/board/useBoardPanel";
import { useBoardHeaderLayout } from "./boardHeaderLayout";
import type { useCardMenu } from "./useBoardCards";
import { useBoardHeaderLayoutMenu } from "./useBoardHeaderLayoutMenu";

/**
 * ボード（カンバン・グループ）の共通の外枠: 見出し → 失敗の文 → ボードの中身と右側のパネル → カードの右クリックメニュー。
 * children はボードの中身（board-main の中）。after はほかのメニューなど、いちばん後ろに描くもの。
 * 右のパネル（rightPanel）はプロジェクトのボードだけ（全プロジェクトのボードは、チャットをそのプロジェクトへ移って開くので持たない）。
 * パネルがあり、見出しの置き方が beside なら、見出しと失敗の文をボードの側（パネルの左）に入れ、パネルを上端まで伸ばす
 */
export function BoardShell({
  className,
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
  const [headerLayout] = useBoardHeaderLayout();
  const layoutMenu = useBoardHeaderLayoutMenu();
  // 見出しの置き方（常時表示 / パネル優先）は右のパネルとの並べ方なので、パネルのないボードでは選ばせず、いつも上に置く
  const beside = rightPanel !== undefined && headerLayout === "beside";
  // 見出しの右クリックで置き方を切り替える（入力欄の上ではふつうの右クリック＝貼り付けなどを残す）
  const top = (
    <div className="board-top" onContextMenu={rightPanel ? layoutMenu.open : undefined}>
      {header}
      <ErrorText message={error} className="board-error" />
    </div>
  );
  const main = <div className="board-main">{children}</div>;
  return (
    <div className={cx("board", className)}>
      {!beside && top}
      {rightPanel ? (
        <div {...rightPanel.body}>
          {beside ? (
            <div className="board-side">
              {top}
              {main}
            </div>
          ) : (
            main
          )}
          <Panel panel={rightPanel.panel} frame={rightPanel.frame} />
        </div>
      ) : (
        <div className="board-body">{main}</div>
      )}
      {after}
      {layoutMenu.menu}
      {menu.menu && <ChatMenu at={menu.menu.at} chat={menu.menu.value} onOpenPanel={onOpenChat} onRename={rename.start} onClose={menu.close} onError={onError} />}
    </div>
  );
}
