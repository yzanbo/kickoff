import { MessagesSquare } from "lucide-react";
import type { HandoffFrom } from "@shared/types";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { composerHandoff } from "@/foundation/ui/storage/storageKeys";
import { useKnownChat } from "@/features/chat/ui/store/knownChats";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import { tipProps } from "@/foundation/ui/kit/HoverTip";
import { openChildChat } from "@/features/chat/ui/open/openChat";

/**
 * 子チャットから渡した依頼の出どころの札「子チャット『…』から」（入力欄の上・送った発言の下・送信待ちの行で同じ形）。押すとその子チャットを開く
 * （設定の「子チャットを開く場所」。消した・読み込んでいない子チャットは押せない）。名前は渡したときのもの
 */
export function HandoffFromChip({ from, onRemove }: { from: HandoffFrom; onRemove?: () => void }) {
  const child = useKnownChat(from.chat_id);
  return (
    <span className="handoff-from">
      <button
        type="button"
        className="handoff-from-open"
        disabled={!child}
        {...tipProps(child ? `子チャット「${from.title}」を開く` : `子チャット「${from.title}」は、もうないか読み込まれていません`)}
        onClick={() => child && openChildChat(child)}
      >
        <MessagesSquare size={12} aria-hidden />
        <span className="handoff-from-text">子チャット「{from.title}」から</span>
      </button>
      {onRemove && <CloseButton label="出どころの札を外す" title="出どころの札を外す（入力欄の文はそのまま。送った発言に「子チャットから」と付けない）" size={11} className="handoff-from-remove" onClick={onRemove} />}
    </span>
  );
}

/** 入力欄の上の出どころの札（「親チャットに追加」で入力欄に入れた依頼。送ると発言の札になり、ここからは消える。× で外す） */
export function ComposerHandoffChip({ chatId }: { chatId: number }) {
  const [from, setFrom] = useSetting(composerHandoff(chatId));
  if (!from) return null;
  return (
    <div className="composer-handoff">
      <HandoffFromChip from={from} onRemove={() => setFrom(null)} />
    </div>
  );
}
