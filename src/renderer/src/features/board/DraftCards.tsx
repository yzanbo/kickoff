import { SquarePen, Trash2 } from "lucide-react";
import { cx } from "@/lib/cx";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { discardDraft, openDraft, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";

/** 列・グループに出す、送る前の新しいチャット（パネル・チャット欄で入力中）の下書き（押すとその欄で開き、表示中なら選択中に見せる） */
export function DraftCards({ drafts }: { drafts: readonly PanelDraft[] }) {
  return drafts.map((d) => <DraftCard key={`${d.panel}:${d.key}`} text={d.text} active={d.showing} onOpen={() => openDraft(d)} onDelete={() => discardDraft(d)} />);
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
