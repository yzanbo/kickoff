import { Brain, ChevronDown, History, RotateCcw } from "lucide-react";
import { EFFORT_LABELS } from "@shared/types";
import { reportFailure } from "@/ui/dialogs";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useChatPaneState, useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";

/**
 * 失敗した作業の終わりの行の下に出す直す操作（いちばん新しい作業が失敗で終わったときだけ）:
 * 続きから再試行・深さを下げて再試行・別のモデルで再試行・巻き戻して再試行（その作業を始めた発言から、同じ文で送り直す。確かめは巻き戻しと同じ）。
 * 選択肢はチャットの画面の変わる様子から読む（チャットの画面の外では出さない）
 */
export function FailedTurnActions({ resultId }: { resultId: number }) {
  const pane = useOptionalChatPane();
  const choices = useChatPaneState((s) => s.retry);
  // 別のモデルの一覧（終わりの行はチャット欄の近く（画面の下のほう）にあるので、下に収まらなければボタンの上に開く）
  const menu = useContextMenu();
  if (!pane || !choices || choices.failed.resultId !== resultId) return null;
  const { lower, models, failed } = choices;
  const retry = pane.retry;
  const prompt = failed.prompt;
  const rewind = prompt && (() => void pane.rewind(prompt.eventId, prompt.text).catch(reportFailure("巻き戻せませんでした")));
  return (
    <div className="turn-retry" role="group" aria-label="失敗した作業を直す">
      <button type="button" className="btn" title="同じ設定のまま、止まったところから続けるよう頼みます" onClick={() => retry()}>
        <RotateCcw size={12} aria-hidden />
        続きから再試行
      </button>
      {lower && (
        <button type="button" className="btn" title="推論の深さを 1 段下げて、続きから再試行します（チャット欄の深さも変わります）" onClick={() => retry({ effort: lower })}>
          <Brain size={12} aria-hidden />
          深さを下げて再試行（{EFFORT_LABELS[lower]}）
        </button>
      )}
      {models.length > 0 && (
        <button
          type="button"
          className="btn turn-retry-model"
          title="別のモデルで、続きから再試行します（チャット欄のモデルも変わります）"
          aria-haspopup="menu"
          aria-expanded={menu.isOpen}
          onClick={menu.toggle}
        >
          <ClaudeMark />
          別のモデルで再試行
          <ChevronDown size={12} aria-hidden />
        </button>
      )}
      {rewind && (
        <button type="button" className="btn" title="この作業を始めた発言まで巻き戻して、同じ文で送り直します（ファイルも戻すか選べます）" onClick={rewind}>
          <History size={12} aria-hidden />
          巻き戻して再試行
        </button>
      )}
      {menu.menu && (
        // 開いているときにボタンを押したら閉じる（外側のクリックとして閉じると、続くクリックで開き直していた）
        <PopupMenu at={menu.menu.at} label="再試行するモデル" ignore=".turn-retry-model" onClose={menu.close}>
          {models.map((m) => (
            <MenuItem key={m.value} onSelect={() => retry({ model: m.value })}>
              {m.label}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </div>
  );
}
