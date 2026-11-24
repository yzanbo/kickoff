import { QUEUE_ACTIONS, type QueueAction } from "@shared/chat/types";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import type { Placement } from "@/foundation/ui/lib/floating";
import { QUEUE_ACTION_LOOKS } from "@/features/compact/ui";
import { AskMenuItems } from "./QueuedAskItems";
import { MoveMenuItems } from "./QueueMoves";
import type { AskHandlers, QueuedGroupActions, QueuedRowActions } from "./queueOps";

/**
 * 送信待ちの行の右クリックのメニュー。選んでいる行（2 件以上）なら選んだもの全体への操作、ほかは 1 件への操作（狭いときに隠す ↑↓ もここに残す）。
 * 挟む行（action）は書き直す・このあとで挟む・別のチャットで聞くを出さない
 */
export function QueuedRowMenu({
  at,
  onClose,
  index: i,
  count,
  action,
  sendLabel,
  selectedCount,
  stopBefore,
  stopAfter,
  actions,
  groupActions,
  ask,
}: {
  at: Placement;
  onClose: () => void;
  index: number;
  count: number;
  action: QueueAction | null;
  /** 「すぐ送る」の文（作業中かと挟む行かで変わる。行のボタンと同じ） */
  sendLabel: string;
  selectedCount: number;
  stopBefore: boolean;
  stopAfter: boolean;
  actions: QueuedRowActions;
  groupActions: QueuedGroupActions;
  ask?: AskHandlers;
}) {
  return (
    <PopupMenu at={at} label="送信待ちの指示の操作" onClose={onClose}>
      {selectedCount > 1 ? (
        // 選んだもの全体への操作（書き直す → 送る → 並べ替え → 新しいチャット・子チャットへ → 消す）
        <>
          <MenuItem onSelect={groupActions.edit} title="選んだ指示の書き直す欄をまとめて開きます（1 件ずつ保存・やめるができます）">
            選んだ {selectedCount} 件を書き直す
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem onSelect={groupActions.sendTogether}>選んだ {selectedCount} 件をまとめて送る</MenuItem>
          <MenuItem onSelect={groupActions.merge} title="送らずに 1 つの指示にまとめます（列の順に空行でつなぎ、添付も合わせます）">
            選んだ {selectedCount} 件を 1 つにまとめる
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem onSelect={() => groupActions.moveTo("top")}>選んだ {selectedCount} 件をいちばん上へ移動</MenuItem>
          <MenuItem onSelect={() => groupActions.moveTo("bottom")}>選んだ {selectedCount} 件をいちばん下へ移動</MenuItem>
          {ask && <AskMenuItems onAsk={ask} what={`選んだ ${selectedCount} 件`} />}
          <div className="menu-separator" role="separator" />
          <MenuItem danger onSelect={groupActions.remove}>
            選んだ {selectedCount} 件を送信待ちから消す
          </MenuItem>
        </>
      ) : (
        // 1 件への操作（書き直す → 送る → 止める（前・あと）→ このあとで挟む（圧縮・消去）→ 並べ替え → 新しいチャット・子チャットへ → 消す）
        <>
          {!action && <MenuItem onSelect={actions.edit}>文を書き直す</MenuItem>}
          {!action && <div className="menu-separator" role="separator" />}
          <MenuItem onSelect={actions.sendNow}>{sendLabel}</MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem
            onSelect={actions.toggleStopBefore}
            title={
              stopBefore
                ? "この指示の前の一時停止を外します"
                : "この指示の前に一時停止を挟みます。手前まで自動で送ったら、この指示から先は送らずに止めておきます（線はドラッグで動かせます）"
            }
          >
            {stopBefore ? "この指示の前の一時停止を外す" : "この指示の前に一時停止を挟む"}
          </MenuItem>
          <MenuItem
            onSelect={actions.toggleStop}
            title={stopAfter ? "この指示のあとの一時停止を外します" : "この指示のあとに一時停止を挟みます。この指示まで自動で送ったら、残りは送らずに止めておきます（線はドラッグで動かせます）"}
          >
            {stopAfter ? "この指示のあとの一時停止を外す" : "この指示のあとに一時停止を挟む"}
          </MenuItem>
          {/* 挟む行のすぐあとにさらに挟むことはしない（指示のあとにだけ） */}
          {!action && <div className="menu-separator" role="separator" />}
          {!action &&
            QUEUE_ACTIONS.map((a) => (
              <MenuItem key={a} onSelect={() => actions.actionAfter(a)} title={QUEUE_ACTION_LOOKS[a].afterTitle}>
                {QUEUE_ACTION_LOOKS[a].after}
              </MenuItem>
            ))}
          {count > 1 && <div className="menu-separator" role="separator" />}
          <MoveMenuItems at={i} last={count - 1} onMove={actions.move} />
          {ask && !action && <AskMenuItems onAsk={ask} what="この指示" />}
          <div className="menu-separator" role="separator" />
          <MenuItem danger onSelect={actions.remove}>
            送信待ちから消す
          </MenuItem>
        </>
      )}
    </PopupMenu>
  );
}

