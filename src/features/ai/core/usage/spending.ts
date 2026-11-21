// 上限を超えたあとの支払いの様子を、実行中の知らせと取得から重ねる決まり（純粋）
import { toCodexCredits } from "@shared/ai/usageCompat";
import type { PayAsYouGo, SpendingNote } from "@shared/ai/usage";

/** まだ何も分からない支払いの様子 */
export const NO_PAY_AS_YOU_GO: PayAsYouGo = { enabled: null, unlimited: false, balance: null, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null };

/** 知らせを重ねた結果（started = 引かれていなかったのが引かれ始めた。チャットのお知らせに残す合図。changed = 配り直す） */
export interface SpendingStep {
  next: PayAsYouGo;
  started: boolean;
  changed: boolean;
}

/**
 * 知らせを重ねる。超過分の知らせ（in_use。Claude）は、そのまま引かれているかにする（取り直しても消さず、枠に空きが戻ったら見張りが外す）。
 * クレジットの知らせ（Codex）は、前に見た残りより減ったら引かれ始めたとし、減り続ける間は to を進め、上限に達した枠がなくなったら外す
 * （減ったのを同じ知らせで見たときは外さない）
 */
export function applySpending(prev: PayAsYouGo | null, note: SpendingNote, at: string): SpendingStep {
  if (note.in_use !== undefined && note.in_use !== null) {
    const inUse = note.in_use;
    // 前の知らせ（まだなければ undefined。確かめる前から引かれていたかは分からない）
    const was = prev?.checked_at ? prev.spending !== null : undefined;
    const next = { ...(prev ?? NO_PAY_AS_YOU_GO), spending: inUse ? (prev?.spending ?? { since: at }) : null, checked_at: at };
    return { next, started: inUse && was !== true, changed: was !== inUse };
  }
  const before = prev?.balance ?? null;
  const balance = note.balance ?? null;
  const dropped = balance !== null && before !== null && balance < before;
  let spending = prev?.spending ?? null;
  if (dropped) spending = spending ? { ...spending, to: balance } : { since: at, from: before, to: balance };
  else if (note.limit_reached === false) spending = null;
  const next: PayAsYouGo = {
    ...(prev ?? NO_PAY_AS_YOU_GO),
    enabled: note.has_credits ?? prev?.enabled ?? false,
    unlimited: note.unlimited ?? prev?.unlimited ?? false,
    balance: balance ?? before,
    spending,
  };
  return { next, started: spending !== null && !prev?.spending, changed: JSON.stringify(toCodexCredits(prev)) !== JSON.stringify(toCodexCredits(next)) };
}
