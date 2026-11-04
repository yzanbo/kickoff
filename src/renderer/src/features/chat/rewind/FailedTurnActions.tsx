import { Brain, ChevronDown, History, RotateCcw } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { EFFORT_LABELS, type EffortLevel, type ChatEvent } from "@shared/types";
import { api } from "@/api";
import { effortsFor, groupModels } from "@/features/chat/options/models";
import { reportFailure } from "@/features/chat/chatActions";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { failedTurnOf, lowerEffort, type FailedTurn } from "./retryActions";
import { RETRY_PROMPT } from "@shared/chat/prompts";
import type { ChatOptionsState } from "@/features/chat/options/ChatOptionsBar";

/** 失敗した作業の直す操作（チャットの画面が渡す。サブエージェントの中身など、渡さない所では出さない） */
interface RetryActions {
  failed: FailedTurn;
  /** 1 段下げた推論の深さ（下げられなければ undefined） */
  lower?: EffortLevel;
  /** 切り替えられるモデル（いまのモデルを除く） */
  models: { value: string; label: string }[];
  retry: (change?: { effort?: EffortLevel; model?: string }) => void;
  /** その作業を始めた発言から巻き戻して、同じ文で送り直す（確かめは巻き戻しと同じ。ファイルも戻すか選べる） */
  rewind?: () => void;
}

export const RetryContext = createContext<RetryActions | null>(null);

/**
 * 直す操作の束（作業中・失敗していなければ null）。選択（モデル・深さ）を変えて送るときは、チャット欄の選択も同じに変える
 * （そのあとの送信も、変えた選択のまま）
 */
export function useRetryActions(
  chatId: number,
  events: ChatEvent[],
  busy: boolean,
  options: ChatOptionsState,
  rewindSend: ((eventId: number, text: string) => Promise<boolean>) | undefined,
): RetryActions | null {
  const failed = useMemo(() => (busy ? undefined : failedTurnOf(events)), [events, busy]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lower = lowerEffort(options.effort, options.effortDefault?.effort ?? null, effortsFor(options.current));
  const current = options.model;
  // モデルの一覧はあとから届くので、届いたら組み立て直す
  const allModels = options.models;
  return useMemo(() => {
    if (!failed) return null;
    const models = groupModels(allModels).flatMap((g) =>
      g.items.filter((i) => i.value !== current).map((i) => ({ value: i.value, label: `${g.family} ${i.version}` })),
    );
    const retry = (change: { effort?: EffortLevel; model?: string } = {}) => {
      const o = optionsRef.current;
      const next = { ...o.options };
      if (change.model !== undefined) {
        next.model = change.model;
        o.setModel(change.model);
        // 新しいモデルで選べない深さは、指定しない（モデルの既定）にする
        const efforts = effortsFor(o.models.find((m) => m.value === change.model));
        if (next.effort && !efforts.includes(next.effort)) next.effort = null;
      }
      if (change.effort !== undefined) {
        next.effort = change.effort;
        o.setEffort(change.effort);
      }
      void api.sendMessage(chatId, RETRY_PROMPT, next).catch(reportFailure("再試行できませんでした"));
    };
    const prompt = failed.prompt;
    return {
      failed,
      lower,
      models,
      retry,
      ...(prompt && rewindSend ? { rewind: () => void rewindSend(prompt.eventId, prompt.text).catch(reportFailure("巻き戻せませんでした")) } : {}),
    };
  }, [failed, lower, current, allModels, chatId, rewindSend]);
}

/** 失敗した作業の終わりの行の下に出す直す操作（いちばん新しい作業が失敗で終わったときだけ） */
export function FailedTurnActions({ resultId }: { resultId: number }) {
  const actions = useContext(RetryContext);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  if (!actions || actions.failed.resultId !== resultId) return null;
  const { lower, models, retry, rewind } = actions;
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
          className="btn"
          title="別のモデルで、続きから再試行します（チャット欄のモデルも変わります）"
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          onClick={(e) => {
            // 終わりの行はチャット欄の近く（画面の下のほう）にあるので、下に収まらなければボタンの上に開く
            const r = e.currentTarget.getBoundingClientRect();
            const height = models.length * 36 + 12;
            const y = r.bottom + 4 + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4;
            setMenu(menu ? undefined : clampToViewport(r.left, y, 220, height));
          }}
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
      {menu && (
        <PopupMenu x={menu.x} y={menu.y} label="再試行するモデル" onClose={() => setMenu(undefined)}>
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
