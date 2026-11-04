import { ArrowRightLeft, Columns2, Rows2, Undo2, X } from "lucide-react";
import type { Chat } from "@shared/types";
import { alertDialog } from "@/ui/dialogs";
import { ChatMenuItems } from "@/features/chat/ChatMenuItems";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { homePane, leavesOf, paneOfTab } from "@/features/panel/layout/paneLayout";
import type { PanelController } from "@/features/panel/usePanel";

/**
 * 右のパネルのタブの右クリックのメニュー: 右・下に分けて開く、ほかのペインへ移す（ペインが 2 つ以上のとき。ペインは並び順の番号で呼び、
 * 一覧のペインに「（一覧）」と添える）、分けたペインのサイドバーと連動したチャットは一覧のペインに戻す、閉じる。
 * チャットのタブには、サイドバーの行と同じチャットの項目（名前を変更・既読 / 未読・固定・セッション ID をコピー・プロジェクトを移動・アーカイブ・削除）も並べる
 */
export function TabMenu({
  panel,
  tabKey,
  at,
  onRename,
  onClose,
}: {
  panel: PanelController;
  tabKey: string;
  /** 置く場所（右クリックの位置） */
  at: Placement;
  /** チャットのタブの名前をその場で変え始める */
  onRename: (chat: Chat) => void;
  onClose: () => void;
}) {
  const pane = paneOfTab(panel.layout, tabKey);
  if (!pane) return null;
  const panes = leavesOf(panel.layout.root);
  const tab = panel.tabs.find((t) => t.key === tabKey);
  // ボードの一覧にあればそれを、なければタブの中のチャットから届いたもの（まだ読み込んでいなければチャットの項目は出さない）
  const chat = panel.chatOf(tab);
  const homeId = panes.length > 1 ? homePane(panel.layout).id : undefined;
  // 分けたペインにある、サイドバーと連動したチャット（× と同じく、一覧のペインへ戻せる）
  const canReturn = homeId !== undefined && pane.id !== homeId && panel.isLinkedTab(tabKey);
  const paneItems = (
    <>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "row", "after", tabKey)}>
        <Columns2 size={14} /> 右に分けて開く
      </MenuItem>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "column", "after", tabKey)}>
        <Rows2 size={14} /> 下に分けて開く
      </MenuItem>
      {panes.length > 1 &&
        panes.map((p, i) =>
          p.id === pane.id ? null : (
            <MenuItem key={p.id} onSelect={() => panel.moveTab(tabKey, p.id)}>
              <ArrowRightLeft size={14} /> {`ペイン ${i + 1}${p.id === homeId ? "（一覧）" : " "}へ移す`}
            </MenuItem>
          ),
        )}
    </>
  );
  const closeItem = (
    <>
      {canReturn && (
        <MenuItem onSelect={() => panel.returnToHome(tabKey)}>
          <Undo2 size={14} /> 一覧のペインに戻す
        </MenuItem>
      )}
      {/* メニューの「閉じる」は聞かずに閉じる（× と違い、アーカイブ・削除はこのメニューの項目で選べる） */}
      <MenuItem onSelect={() => panel.closeTab(tabKey)}>
        <X size={14} /> タブを閉じる
      </MenuItem>
    </>
  );
  return (
    <PopupMenu at={at} label="タブのメニュー" onClose={onClose}>
      {chat ? (
        <ChatMenuItems
          chat={chat}
          onRename={onRename}
          onClose={onClose}
          onError={(m) => void alertDialog("操作できませんでした", m)}
          before={
            <>
              {paneItems}
              <div className="menu-separator" role="separator" />
            </>
          }
          after={
            <>
              <div className="menu-separator" role="separator" />
              {closeItem}
            </>
          }
        />
      ) : (
        <>
          {paneItems}
          {closeItem}
        </>
      )}
    </PopupMenu>
  );
}
