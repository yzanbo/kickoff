import { useState } from "react";
import { Check, ChevronDown, Inbox } from "lucide-react";
import { HANDOFF_VIA_LABELS, HANDOFF_VIAS, type HandoffVia } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import { HANDOFF_AFTER_LABELS, HANDOFF_AFTERS, handoffAfterFor, type HandoffAfter } from "@shared/chat/handoff";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { tipProps } from "@/foundation/ui/kit/HoverTip";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { handOffTurn } from "./handBack";
import { useActionButton } from "@/features/chat/ui";

/** 渡し方ごとの説明（▾ のメニューの下の一言） */
const VIA_HINTS: Record<HandoffVia, string> = {
  composer: "親チャットの入力欄の後ろに足して、親を見せる（送るのは自分で）",
  send: "親が作業していなければすぐ送り、作業中ならいまの作業に伝える",
  queue: "親チャットの送信待ちの最後に足す（いまは送らない）",
};

/**
 * 子チャットの作業の終わりの行の「親チャットに追加 ▾」: その作業の最後の返答を、そのまま（引用・見出しなし）直接の親チャットに渡す。
 * 押すと設定の渡し方（storage.settings.handBackVia）と渡したあと（storage.settings.handBackAfter）で渡し、▾ で今回だけ別の渡し方・渡したあとを選ぶ（渡したあとを先に選び、渡し方を押すと渡す）。
 * 依頼文の頼みに答えた作業（prominent）では文字のボタンで目立たせ、ほかの作業ではアイコンだけ
 */
export function AddToParentButton({ chat, turnEventId, prominent }: { chat: Chat; turnEventId: number; prominent: boolean }) {
  const menu = useContextMenu({ align: "start" });
  const [defaultVia] = useSetting(storage.settings.handBackVia);
  // ▾ のメニューで選んだ、今回だけの渡したあと（開くたびに設定の値から）
  const [after, setAfter] = useState<HandoffAfter>("keep");
  // 渡してから返るまで押せない（すばやく 2 回押しても 1 回だけ渡す）
  const action = useActionButton();
  const run = (via: HandoffVia, afterThis: HandoffAfter) => action.press("", () => handOffTurn(chat, turnEventId, via, afterThis), "親チャットに渡せませんでした");
  const tip = `この返答をそのまま親チャットに渡す（${HANDOFF_VIA_LABELS[defaultVia]}。▾ で今回だけ別の渡し方）`;
  return (
    <span className={cx("handoff-split", prominent && "prominent")} data-turn={turnEventId}>
      {prominent ? (
        <button type="button" className="btn btn-primary handoff-main" data-size="sm" {...tipProps(tip)} disabled={action.pending()} onClick={() => run(defaultVia, readSetting(storage.settings.handBackAfter))}>
          <Inbox size={13} aria-hidden />
          親チャットに追加
        </button>
      ) : (
        <IconButton size="sm" icon={Inbox} label="親チャットに追加" title={tip} iconSize={13} type="button" className="turn-action handoff-main" disabled={action.pending()} onClick={() => run(defaultVia, readSetting(storage.settings.handBackAfter))} />
      )}
      <IconButton
        size="sm"
        icon={ChevronDown}
        label="親チャットへの渡し方を選ぶ"
        title="親チャットへの渡し方を、今回だけ選ぶ"
        iconSize={12}
        type="button"
        className={cx("handoff-more", prominent ? "btn btn-primary" : "turn-action")}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => {
          if (!menu.isOpen) setAfter(readSetting(storage.settings.handBackAfter));
          menu.toggle(e);
        }}
      />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="親チャットへの渡し方" ignore={`.handoff-split[data-turn="${turnEventId}"] .handoff-more`} onClose={menu.close}>
          <div className="menu-label">渡し方（今回だけ）</div>
          {HANDOFF_VIAS.map((via) => (
            <MenuItem key={via} className="send-target" onSelect={() => run(via, after)}>
              <span className="send-target-text">
                <span>{HANDOFF_VIA_LABELS[via]}</span>
                <span className="send-target-hint">
                  {VIA_HINTS[via]}
                  {after !== "keep" && `。渡したら${HANDOFF_AFTER_LABELS[handoffAfterFor(after, via)]}`}
                </span>
              </span>
            </MenuItem>
          ))}
          <div className="menu-separator" role="separator" />
          <div className="menu-label">渡したあと（今回だけ）</div>
          {HANDOFF_AFTERS.map((value) => (
            <MenuItem
              key={value}
              role="menuitemradio"
              checked={after === value}
              keepOpen
              title={value === "delete" ? "削除は今すぐ送る・送信待ちのときだけ（入力欄に入れるときはアーカイブ）。孫チャットも一緒に消えます" : undefined}
              onSelect={() => setAfter(value)}
            >
              <span className="project-switch-item">{HANDOFF_AFTER_LABELS[value]}</span>
              {after === value && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </span>
  );
}
