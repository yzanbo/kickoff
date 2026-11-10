import { SquarePen } from "lucide-react";
import { useMemo, useState } from "react";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { startDraftDrag } from "@/features/group/groups";
import { draftTitleOf, openDraft, useAllDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { DraftMenuItems, DraftSplitItems, DraftTitleInput } from "@/features/chat/DraftMenuItems";
import { useRoute } from "@/app/router";
import { cx } from "@/lib/cx";
import { panelKey } from "@/features/panel/surfaces";
import { useChatPlacement } from "@/features/project/page/chatPlacement";

/**
 * 下書きのタブを、いまの画面のプロジェクトのチャットのパネルで表示しているか（サイドバーの行を選択中に見せる。チャットの行が URL で
 * 選択中になるのと同じく、タブで選んでいるものがサイドバーで分かるように。利用者の依頼）。チャットのパネルが出ているのは、
 * チャットタブに分ける置き方ならチャットタブ、ボードの右に置くならボード（パネルが開いているときだけ = draft.showing）
 */
function useDraftSelected(draft: PanelDraft): boolean {
  const route = useRoute();
  const [placement] = useChatPlacement();
  if (!draft.showing || draft.panel !== panelKey("board", draft.projectId)) return false;
  if (route.name !== "project" || route.id !== draft.projectId) return false;
  return placement === "separate" ? route.tab === "chats" : route.tab === "board";
}

/** プロジェクトの下書き（すべてのボード・チャット欄の分。どのグループに置くかは bucketChats で分ける。下書きが変わるまでは同じ配列） */
export function useProjectDrafts(projectId: number): PanelDraft[] {
  const all = useAllDrafts();
  return useMemo(() => all.filter((d) => d.projectId === projectId), [all, projectId]);
}

/**
 * サイドバーのプロジェクトの、送る前の新しいチャット（ボードの右のパネル・プロジェクトのチャット欄で書いている途中）。
 * ボードの「下書き」の列と同じもの。押すとそのパネルで開き（別の画面のものは、その画面へ移ってから）、右クリックはチャットの行と同じ並びの DraftMenuItems（ピン留めしたものは「固定」に出す）。
 * ドラッグしてグループ（・グループなし）へ落とすと、作成先のグループを変える（送ったときにそのグループに入る。落とし先はまとまりを包む要素）
 */
export function DraftRows({ drafts }: { drafts: readonly PanelDraft[] }) {
  if (drafts.length === 0) return null;
  return (
    <ul className="chat-rows draft-rows">
      {drafts.map((d) => (
        <DraftRow key={`${d.panel}:${d.key}`} draft={d} />
      ))}
    </ul>
  );
}

/** 下書きの 1 行（チャットの行の並びの中にも置ける。手動の並びでタブの位置に合わせるとき） */
export function DraftRow({ draft }: { draft: PanelDraft }) {
  const menu = useContextMenu();
  const selected = useDraftSelected(draft);
  const [renaming, setRenaming] = useState(false);
  const slot = (
    <span className="status-slot draft-slot" aria-hidden>
      <SquarePen size={12} />
    </span>
  );
  // 名前を変えている間は、チャットの行と同じく押しても開かず、ドラッグもしない（入力欄の文字を選べるように）
  if (renaming)
    return (
      <li className="chat-row-item">
        <div className={cx("chat-row draft-row renaming", selected && "active")}>
          {slot}
          <span className="chat-row-body">
            <DraftTitleInput draft={draft} onDone={() => setRenaming(false)} />
          </span>
        </div>
      </li>
    );
  return (
    <li className="chat-row-item">
      <button
        type="button"
        className={cx("chat-row draft-row", selected && "active")}
        aria-current={selected || undefined}
        title="下書き（ドラッグでグループへ移す・右クリックで名前の変更・ピン留め・グループやプロジェクトの変更・削除）"
        draggable
        onDragStart={(e) => startDraftDrag(e, draft)}
        onClick={() => openDraft(draft)}
        onContextMenu={menu.open}
      >
        {slot}
        <span className="chat-row-body">
          <span className="chat-row-line">
            {/* 名前は最初のチャットを送るまで「New Chat」のまま（タブと同じ。利用者の依頼で、前は書きかけの文の 1 行目を出していた）。右クリックで付けた名前があればそれ */}
            <span className="chat-row-title">{draftTitleOf(draft)}</span>
            <span className="chat-row-time">下書き</span>
          </span>
        </span>
      </button>
      {menu.menu && (
        // チャットの行の右クリック（ChatMenu）と同じ並びで、右・下に分けて開くも置く
        <PopupMenu at={menu.menu.at} label="下書きの操作" escape="pass" onClose={menu.close}>
          <DraftMenuItems
            draft={draft}
            onOpen={() => openDraft(draft)}
            onRename={() => setRenaming(true)}
            onClose={menu.close}
            before={<DraftSplitItems draft={draft} />}
          />
        </PopupMenu>
      )}
    </li>
  );
}
