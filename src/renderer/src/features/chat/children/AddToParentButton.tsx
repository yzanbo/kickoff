import { ChevronDown, Inbox } from "lucide-react";
import { HANDOFF_VIA_LABELS, HANDOFF_VIAS, type Chat, type HandoffVia } from "@shared/types";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { HANDOFF_VIA } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { tipProps } from "@/ui/HoverTip";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { handOffTurn } from "./handoff";

/** 渡し方ごとの説明（▾ のメニューの下の一言） */
const VIA_HINTS: Record<HandoffVia, string> = {
  composer: "親チャットの入力欄の後ろに足して、親を見せる（送るのは自分で）",
  send: "親が作業していなければすぐ送り、作業中ならいまの作業に伝える",
  queue: "親チャットの送信待ちの最後に足す（いまは送らない）",
};

/**
 * 子チャットの作業の終わりの行の「親チャットに追加 ▾」: その作業の最後の返答を、そのまま（引用・見出しなし）直接の親チャットに渡す。
 * 押すと設定の渡し方（HANDOFF_VIA）で渡し、▾ で今回だけ別の渡し方を選ぶ。依頼文の頼みに答えた作業（prominent）では文字のボタンで目立たせ、
 * ほかの作業ではアイコンだけ
 */
export function AddToParentButton({ chat, turnEventId, prominent }: { chat: Pick<Chat, "id" | "parent_chat_id">; turnEventId: number; prominent: boolean }) {
  const menu = useContextMenu({ align: "start" });
  const [defaultVia] = useSetting(HANDOFF_VIA);
  const run = (via: HandoffVia) => void handOffTurn(chat, turnEventId, via);
  const tip = `この返答をそのまま親チャットに渡す（${HANDOFF_VIA_LABELS[defaultVia]}。▾ で今回だけ別の渡し方）`;
  return (
    <span className={cx("handoff-split", prominent && "prominent")} data-turn={turnEventId}>
      {prominent ? (
        <button type="button" className="btn btn-sm btn-primary handoff-main" {...tipProps(tip)} onClick={() => run(defaultVia)}>
          <Inbox size={13} aria-hidden />
          親チャットに追加
        </button>
      ) : (
        <IconButton icon={Inbox} label="親チャットに追加" title={tip} size={13} type="button" className="turn-action handoff-main" onClick={() => run(defaultVia)} />
      )}
      <IconButton
        icon={ChevronDown}
        label="親チャットへの渡し方を選ぶ"
        title="親チャットへの渡し方を、今回だけ選ぶ"
        size={12}
        type="button"
        className={cx("handoff-more", prominent ? "btn btn-sm btn-primary" : "turn-action")}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => menu.toggle(e)}
      />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="親チャットへの渡し方" ignore={`.handoff-split[data-turn="${turnEventId}"] .handoff-more`} onClose={menu.close}>
          <div className="menu-label">渡し方（今回だけ）</div>
          {HANDOFF_VIAS.map((via) => (
            <MenuItem key={via} className="send-target" onSelect={() => run(via)}>
              <span className="send-target-text">
                <span>{HANDOFF_VIA_LABELS[via]}</span>
                <span className="send-target-hint">{VIA_HINTS[via]}</span>
              </span>
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </span>
  );
}
