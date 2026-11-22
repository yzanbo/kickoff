import { useMemo } from "react";
import { RETRY_PROMPT } from "@shared/chat/prompts";
import { api } from "@/foundation/ui/api";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { effortsFor, groupModels } from "@/features/ai/ui/options/models";
import type { ChatOptionsState } from "@/features/ai/ui/options/ChatOptionsBar";
import type { RetryChange, RetryChoices } from "@/features/conversation/ui/rewindContext";
import { lowerEffort } from "./retryActions";
import { failedTurn } from "./selectors";

/**
 * 失敗した作業の直し方の選択肢（作業中・失敗していなければ null）。モデルの一覧はあとから届くので、届いたら組み立て直す。
 * 記録・選択が変わったときだけ作り直す（チャットの画面の変わる様子に入れ、失敗した作業の終わりの行だけが描き直る）
 */
export function useRetryChoices(chatId: number, busy: boolean, options: ChatOptionsState): RetryChoices | null {
  const latest = failedTurn.useFor(chatId);
  const failed = busy ? undefined : latest;
  const lower = lowerEffort(options.effort, options.effortDefault?.effort ?? null, effortsFor(options.current));
  const current = options.model;
  const allModels = options.models;
  return useMemo(() => {
    if (!failed) return null;
    const models = groupModels(allModels).flatMap((g) =>
      g.items.filter((i) => i.value !== current).map((i) => ({ value: i.value, label: `${g.family} ${i.version}` })),
    );
    return { failed, lower, models };
  }, [failed, lower, current, allModels]);
}

/**
 * 失敗した作業を、続きから再試行する（RETRY_PROMPT を送る）。深さ・モデルを変えるときは、チャット欄の選択も同じに変える
 * （そのあとの送信も、変えた選択のまま）。新しいモデルで選べない深さは、指定しない（モデルの既定）にする
 */
export function retryTurn(chatId: number, options: ChatOptionsState, change: RetryChange = {}): void {
  const next = { ...options.options };
  if (change.model !== undefined) {
    next.model = change.model;
    options.setModel(change.model);
    const efforts = effortsFor(options.models.find((m) => m.value === change.model));
    if (next.effort && !efforts.includes(next.effort)) next.effort = null;
  }
  if (change.effort !== undefined) {
    next.effort = change.effort;
    options.setEffort(change.effort);
  }
  void api.sendMessage(chatId, RETRY_PROMPT, next).catch(reportFailure("再試行できませんでした"));
}
