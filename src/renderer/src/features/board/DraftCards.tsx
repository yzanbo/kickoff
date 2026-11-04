import { SquarePen, Trash2 } from "lucide-react";
import { cx } from "@/lib/cx";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { PanelController } from "@/features/panel/usePanel";
import type { DraftTarget } from "@/features/chatList/buckets";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";

/** ボードに出す下書き（送る前の新しいチャット。どのパネルのどのタブか。作成先でまとまりに分ける） */
export interface BoardDraft extends DraftTarget {
  key: string;
  text: string;
  panel: PanelController;
  /** 押したときにタブを表示する方法（プロジェクトのチャット欄の下書きは、欄を開いてから表示する） */
  show: (key: string) => void;
}

/** パネルの下書きを、ボードに出す形にする（show を省けば、そのパネルでタブを表示する） */
export const boardDrafts = (panel: PanelController, show: (key: string) => void = panel.showTab): BoardDraft[] =>
  panel.drafts.map((d) => ({ ...d.target, key: d.key, text: d.text, panel, show }));

/** 列・グループに出す、送る前の新しいチャット（パネルで入力中）の下書き */
export function DraftCards({ drafts }: { drafts: readonly BoardDraft[] }) {
  return drafts.map((d) => <DraftCard key={`${d.panel.surface}:${d.key}`} text={d.text} active={d.panel.isShowingTab(d.key)} onOpen={() => d.show(d.key)} onDelete={() => d.panel.closeTab(d.key)} />);
}

/** 下書きのカード。書いている途中の文があれば、その初めの数行を出す。押すとそのタブを表示し、右クリックで開く・削除を選べる */
function DraftCard({ text, active, onOpen, onDelete }: { text: string; active: boolean; onOpen: () => void; onDelete: () => void }) {
  const written = text.trim();
  const menu = useContextMenu();
  return (
    <>
      <button
        type="button"
        className={cx("draft-card", active && "selected")}
        title="右側で入力中の新しいチャット（右クリックで削除）"
        onClick={onOpen}
        onContextMenu={menu.open}
      >
        <span className="draft-card-head">
          <SquarePen size={13} aria-hidden />
          {written ? "書きかけ" : NEW_CHAT_TITLE}
        </span>
        {written && <span className="draft-card-text">{written}</span>}
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} onClose={menu.close}>
          <MenuItem onSelect={onOpen}>
            <SquarePen size={14} /> 開く
          </MenuItem>
          <MenuItem danger onSelect={onDelete}>
            <Trash2 size={14} /> 削除（入力中の内容は消えます）
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
