import { ChevronDown, ClipboardPenLine, Inbox, Quote } from "lucide-react";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/** 親チャットに渡す ▾ の項目: request = 依頼文を作ってもらう / quote = 最新の答えを引用して渡す */
export interface HandBack {
  request?: () => void;
  quote?: () => void;
}

/** 「親チャットに渡す ▾」: 押すと、渡し方を 2 つから選ぶ（依頼文を作ってもらう / 最新の答えを引用して渡す） */
export function HandBackMenu({ handBack }: { handBack: HandBack }) {
  const menu = useContextMenu({ align: "end" });
  return (
    <>
      <button
        type="button"
        className="btn btn-primary child-chat-hand-back"
        data-size="sm"
        disabled={!handBack.request && !handBack.quote}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title="親チャットに渡す（依頼文を作ってもらうか、最新の答えを引用して渡すかを選ぶ）"
        onClick={menu.toggle}
      >
        <Inbox size={13} aria-hidden />
        <span className="child-chat-hand-back-text">親チャットに渡す</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="親チャットへの渡し方" ignore=".child-chat-hand-back" onClose={menu.close}>
          <MenuItem className="send-target" disabled={!handBack.request} onSelect={() => handBack.request?.()}>
            <ClipboardPenLine size={15} aria-hidden className="send-target-icon" />
            <span className="send-target-text">
              <span>依頼文を作ってもらう</span>
              <span className="send-target-hint">この子チャットの AI に、親チャットの AI へ渡す依頼文を書いてもらう</span>
            </span>
          </MenuItem>
          <MenuItem className="send-target" disabled={!handBack.quote} onSelect={() => handBack.quote?.()}>
            <Quote size={15} aria-hidden className="send-target-icon" />
            <span className="send-target-text">
              <span>最新の答えを引用して渡す</span>
              <span className="send-target-hint">いちばん新しい答えを引用にして、親チャットの入力欄に入れる（送るのは自分で）</span>
            </span>
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
