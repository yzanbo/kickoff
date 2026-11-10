import { OctagonPause, X } from "lucide-react";
import { api } from "@/api";
import { IconButton } from "@/ui/IconButton";
import { queueFailed as failed } from "./queueFailed";
import { cx } from "@/lib/cx";

/**
 * 送信待ちは空だが、いまの作業が終わったら一時停止する印（1 件目の上の印）があるときの 1 行（質問として送ったときなど）。
 * 送信待ちの一覧は空なら出さないので、ここで止める予定を見せ、× でやめられるようにする（その作業のあいだに来た指示の前で止まる）。
 * compact: チャット欄のコンパクト表示（送信待ちと同じく詰める）
 */
export function QueuedPauseNotice({ chatId, compact }: { chatId: number; compact: boolean }) {
  return (
    <div className={cx("queued-messages queued-pause-notice", compact && "compact")} role="note">
      <OctagonPause size={12} aria-hidden />
      <span className="queued-pause-text" title="この作業のあいだに送信待ちに入れた指示は、自動で送らずに止めておきます（答えを見てから次を決めるとき）">
        この作業が終わったら一時停止します
      </span>
      <IconButton icon={X} label="一時停止をやめる" size={13} onClick={() => void api.setQueueStops(chatId, []).catch(failed)} />
    </div>
  );
}
