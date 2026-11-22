import { ArrowDownToLine, ArrowUpToLine, Merge, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { api } from "@/foundation/ui/api";
import { confirm } from "@/foundation/ui/kit/ask";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useChatScreen } from "@/features/chat/ui";
import { queueFailed as failed } from "./queueFailed";

/**
 * 行を選んでいるときの見出しの右（ふだんの操作のまとまりと入れ替える。選ぶのをやめると戻る）。行と同じ 2 つのまとまり:
 * 並べ替え（いちばん上へ・いちばん下へ）｜ 選んだものへの操作（書き直す・1 つにまとめる・まとめて送る・消す・選ぶのをやめる）
 */
export function QueuedSelectionActions({
  selected,
  busy,
  onClearSelection,
  onEditSelected,
}: {
  /** 選んでいる指示（列の順） */
  selected: string[];
  busy: boolean;
  onClearSelection: () => void;
  /** 選んだ指示の書き直す欄をまとめて開く（いくつでも同時に書き直せる） */
  onEditSelected: () => void;
}) {
  const { chatId } = useChatScreen();
  const n = selected.length;
  // 作業中は止めずに、いまのやり取りに伝える（Runner の tell。メインエージェントがいまの手順の切れ目で読む）
  const stopping = busy ? "（作業は止めずに、いまのやり取りに足す）" : "";
  const done = () => onClearSelection();
  return (
    <div className="queued-head-tools">
      <span className="queued-head-group queued-head-moves" role="group" aria-label={`選んだ ${n} 件の並べ替え`}>
        <IconButton icon={ArrowUpToLine} iconSize={13} label={`選んだ ${n} 件をいちばん上へ移動`} onClick={() => void api.moveQueuedMany(chatId, selected, "top").catch(failed)} />
        <IconButton icon={ArrowDownToLine} iconSize={13} label={`選んだ ${n} 件をいちばん下へ移動`} onClick={() => void api.moveQueuedMany(chatId, selected, "bottom").catch(failed)} />
      </span>
      <span className="queued-head-group" role="group" aria-label={`選んだ ${n} 件への操作`}>
        <button
          type="button"
          className="btn queued-head-btn"
          data-size="sm"
          aria-label={`選んだ ${n} 件を書き直す`}
          title={`選んだ ${n} 件の書き直す欄をまとめて開く（1 件ずつ保存・やめるができる）`}
          onClick={onEditSelected}
        >
          <Pencil size={12} aria-hidden />
          <span className="queued-head-label">書き直す</span>
        </button>
        {/* 送らずに、選んだ指示を 1 件にまとめる（列の順に空行でつなぐ。選んだうちのいちばん上の位置に残る） */}
        {n > 1 && (
          <button
            type="button"
            className="btn queued-head-btn"
            data-size="sm"
            aria-label={`選んだ ${n} 件を 1 つにまとめる`}
            title={`選んだ ${n} 件を、送らずに 1 つの指示にまとめる（列の順に空行でつなぎ、添付も合わせる。選んだうちのいちばん上の位置に残る）`}
            onClick={() => void api.mergeQueued(chatId, selected).then(done, failed)}
          >
            <Merge size={12} aria-hidden />
            <span className="queued-head-label">1 つにまとめる</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary queued-head-btn"
          data-size="sm"
          aria-label={`選んだ ${n} 件をまとめて送る`}
          title={`選んだ ${n} 件を 1 つにまとめて、すぐ送る${stopping}`}
          onClick={() => void api.sendAllQueued(chatId, selected).then(done, failed)}
        >
          <SendHorizontal size={12} aria-hidden />
          <span className="queued-head-label">まとめて送る</span>
        </button>
        <button
          type="button"
          className="btn queued-head-btn queued-remove"
          data-size="sm"
          data-look="outline"
          aria-label={`選んだ ${n} 件を消す`}
          title={`選んだ ${n} 件を消す（確かめてから）`}
          onClick={() => removeSelected(chatId, selected, done)}
        >
          <Trash2 size={12} aria-hidden />
          <span className="queued-head-label">消す</span>
        </button>
        <IconButton icon={X} iconSize={13} label="選ぶのをやめる" title="選ぶのをやめる（Esc）" onClick={onClearSelection} />
      </span>
    </div>
  );
}

/** 選んだ指示を消す（見出しのボタン・行の右クリックのどちらからも確かめてから。消せたら done） */
export function removeSelected(chatId: number, selected: string[], done: () => void): void {
  const n = selected.length;
  void confirm({ title: `選んだ ${n} 件を消しますか？`, message: "消した指示は送られません。元に戻せません。", confirmLabel: "消す", danger: true }).then(async (ok) => {
    if (ok) await api.removeQueuedMany(chatId, selected).then(done, failed);
  });
}
