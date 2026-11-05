import { Reply } from "lucide-react";
import { CloseButton } from "@/ui/IconButton";
import type { RelayTarget } from "@/features/chat/pane/chatPaneContext";

/**
 * チャット欄の上の「宛先: サブエージェント『調査』」（カードの「伝える」で付く）。送るとメインのエージェントが SendMessage でそのまま渡す。
 * × でメインのエージェントへ送る欄に戻す（送ったあとも戻る）
 */
export function RelayBanner({ target, onClear }: { target: RelayTarget; onClear: () => void }) {
  return (
    <div className="relay-banner">
      <Reply size={13} aria-hidden className="relay-banner-icon" />
      <span className="relay-banner-text">
        宛先: サブエージェント「<strong>{target.description}</strong>」
      </span>
      <span className="relay-banner-note">メインのエージェントから伝えます</span>
      <CloseButton label="宛先をメインのエージェントに戻す" size={13} type="button" onClick={onClear} />
    </div>
  );
}
