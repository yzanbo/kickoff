import { AppWindow, ArrowRightLeft, Columns2, Rows2, Undo2, X } from "lucide-react";
import type { Placement } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { homePane, leavesOf, paneOfTab } from "@/features/panel/ui/layout/paneTree";
import type { PanelController } from "@/features/panel/ui/usePanel";
import { confirmTabClose } from "@/features/panel/ui/state/closeTabs";
import { kindOf } from "@/features/panel/ui/state/panelStore";
import { canPopOut, popOutTab } from "./popOutTab";
import { ViewSubmenu } from "./PanelViewMenu";

/**
 * 右のパネルのタブの右クリックのメニュー: 表示する場所の組（右・下に分ける・ほかのペインへ移す（ペインが 2 つ以上のとき。ペインは並び順の番号で呼び、
 * 一覧のペインに「（一覧）」と添える）・別ウィンドウで開く・分けたペインのサイドバーと連動したチャットは一覧のペインに戻す）、
 * いちばん下にタブの組（タブの表示 ›・タブを閉じる）。
 * 種類が Menu を持てば、その項目（チャット・子チャットのチャットの項目と「新しいチャット」、新しいチャットの下書きの項目）を、ここで作った組と並べて種類が描く。
 * 閉じるのすぐ上に「タブの表示 ›」（タブの列の「表示」のメニューと同じ項目を横に開く。ViewSubmenu）。
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
  /** チャット・新しいチャットのタブの名前をその場で変え始める */
  onRename: () => void;
  onClose: () => void;
}) {
  const tab = panel.tabs.find((t) => t.key === tabKey);
  const pane = paneOfTab(panel.layout, tabKey);
  if (!pane) return null;
  const panes = leavesOf(panel.layout.root);
  // 一覧のペインはサイドバーと連動したチャットが入るペインなので、チャットを出す欄だけで「（一覧）」と添える
  const homeId = panes.length > 1 && panel.kinds.has("chat") ? homePane(panel.layout).id : undefined;
  // 分けたペインにある、サイドバーと連動したチャット（× と同じく、一覧のペインへ戻せる）
  const canReturn = homeId !== undefined && pane.id !== homeId && panel.isLinkedTab(tabKey);
  // 表示する場所の組（分ける・ほかのペインへ移す・別ウィンドウ・一覧のペインに戻す）。タブはもう開いているので「開く」は付けず、ペインの右上のボタンと同じ「右に分ける」「下に分ける」と呼ぶ
  const paneItems = (
    <>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "row", "after", tabKey)}>
        <Columns2 size={14} /> 右に分ける
      </MenuItem>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "column", "after", tabKey)}>
        <Rows2 size={14} /> 下に分ける
      </MenuItem>
      {panes.length > 1 &&
        panes.map((p, i) =>
          p.id === pane.id ? null : (
            <MenuItem key={p.id} onSelect={() => panel.moveTab(tabKey, p.id)}>
              <ArrowRightLeft size={14} /> {`ペイン ${i + 1}${p.id === homeId ? "（一覧）" : " "}へ移す`}
            </MenuItem>
          ),
        )}
      {/* チャットのパネルのチャット・チャットの画面の右の欄のサブエージェント・変更・ファイルなどは、別ウィンドウへ移せる（2 枚目の画面に置くなど） */}
      {canPopOut(tab, panel.key) && (
        <MenuItem onSelect={() => popOutTab(panel, tabKey)}>
          <AppWindow size={14} /> 別ウィンドウで開く
        </MenuItem>
      )}
      {canReturn && (
        <MenuItem onSelect={() => panel.returnToHome(tabKey)}>
          <Undo2 size={14} /> 一覧のペインに戻す
        </MenuItem>
      )}
    </>
  );
  // タブの組（いちばん下。タブの表示 ›・タブを閉じる）
  const tabItems = (
    <>
      <div className="menu-separator" role="separator" />
      <ViewSubmenu panel={panel} />
      {/* メニューの「閉じる」は、チャットの閉じ方を聞かずに閉じる（× と違い、アーカイブ・削除はこのメニューの項目で選べる）。保存していない書きかけのあるファイル・ノートは × と同じく保存するかを聞く */}
      <MenuItem onSelect={() => void (tab ? confirmTabClose(panel.key, tab) : Promise.resolve(true)).then((ok) => ok && panel.closeTab(tabKey))}>
        <X size={14} /> タブを閉じる
      </MenuItem>
    </>
  );
  const Menu = tab && kindOf(tab).Menu;
  return (
    <PopupMenu at={at} label="タブのメニュー" onClose={onClose}>
      {Menu ? (
        <Menu tab={tab} panel={panel} paneId={pane.id} before={paneItems} after={tabItems} onRename={onRename} onClose={onClose} />
      ) : (
        <>
          {paneItems}
          {tabItems}
        </>
      )}
    </PopupMenu>
  );
}
