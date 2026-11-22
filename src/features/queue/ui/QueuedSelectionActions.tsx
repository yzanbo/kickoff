import { ArrowDownToLine, ArrowUpToLine, Merge, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useQueueActions } from "./queueContext";
import { QueueHeadButton } from "./QueueHeadButton";
import { groupActionsOf } from "./queueOps";

/**
 * 行を選んでいるときの見出しの右（ふだんの操作のまとまりと入れ替える。選ぶのをやめると戻る）。行と同じ 2 つのまとまり:
 * 並べ替え（いちばん上へ・いちばん下へ）｜ 選んだものへの操作（書き直す・1 つにまとめる・まとめて送る・消す・選ぶのをやめる）
 */
export function QueuedSelectionActions({ busy }: { busy: boolean }) {
  const q = useQueueActions();
  const { selected, clearSelection } = q.selection;
  const group = groupActionsOf(q);
  const n = selected.length;
  // 作業中は止めずに、いまのやり取りに伝える（Runner の tell。メインエージェントがいまの手順の切れ目で読む）
  const stopping = busy ? "（作業は止めずに、いまのやり取りに足す）" : "";
  return (
    <div className="queued-head-tools">
      <span className="queued-head-group queued-head-moves" role="group" aria-label={`選んだ ${n} 件の並べ替え`}>
        <IconButton icon={ArrowUpToLine} iconSize={13} label={`選んだ ${n} 件をいちばん上へ移動`} onClick={() => group.moveTo("top")} />
        <IconButton icon={ArrowDownToLine} iconSize={13} label={`選んだ ${n} 件をいちばん下へ移動`} onClick={() => group.moveTo("bottom")} />
      </span>
      <span className="queued-head-group" role="group" aria-label={`選んだ ${n} 件への操作`}>
        <QueueHeadButton
          icon={Pencil}
          label="書き直す"
          aria-label={`選んだ ${n} 件を書き直す`}
          title={`選んだ ${n} 件の書き直す欄をまとめて開く（1 件ずつ保存・やめるができる）`}
          onClick={group.edit}
        />
        {/* 送らずに、選んだ指示を 1 件にまとめる（列の順に空行でつなぐ。選んだうちのいちばん上の位置に残る） */}
        {n > 1 && (
          <QueueHeadButton
            icon={Merge}
            label="1 つにまとめる"
            aria-label={`選んだ ${n} 件を 1 つにまとめる`}
            title={`選んだ ${n} 件を、送らずに 1 つの指示にまとめる（列の順に空行でつなぎ、添付も合わせる。選んだうちのいちばん上の位置に残る）`}
            onClick={group.merge}
          />
        )}
        <QueueHeadButton
          icon={SendHorizontal}
          label="まとめて送る"
          tone="primary"
          aria-label={`選んだ ${n} 件をまとめて送る`}
          title={`選んだ ${n} 件を 1 つにまとめて、すぐ送る${stopping}`}
          onClick={group.sendTogether}
        />
        <QueueHeadButton
          icon={Trash2}
          label="消す"
          look="outline"
          className="queued-remove"
          aria-label={`選んだ ${n} 件を消す`}
          title={`選んだ ${n} 件を消す（確かめてから）`}
          onClick={group.remove}
        />
        <IconButton icon={X} iconSize={13} label="選ぶのをやめる" title="選ぶのをやめる（Esc）" onClick={clearSelection} />
      </span>
    </div>
  );
}
