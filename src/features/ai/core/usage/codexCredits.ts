import type { CodexCredits } from "@shared/ai/types";
import type { Bus } from "@/foundation/core/bus";
import type { CreditsNote } from "@/features/ai/core/providers/types";

/** クレジットの残り（使用状況の応答は数、app-server の知らせは数の文字）。読めなければ null */
export function creditBalanceOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** 上限に達した枠があるか（使用率の一覧から。枠が 1 つもなければ分からない = null） */
export function limitReachedOf(percents: readonly (number | null)[]): boolean | null {
  const known = percents.filter((p): p is number => p !== null);
  return known.length === 0 ? null : known.some((p) => p >= 100);
}

/**
 * Codex のクレジットの見張り。使用状況の取得（1 分ごと）と、Codex の実行中の知らせ（account/rateLimits/updated）の両方から残りを受け、
 * 前に見た残りより減ったら「クレジットから引かれている」にする（意図せずクレジットを使っていないかを下の帯で見せる）。
 * 上限に達した枠がなくなったら外す（減ったのを同じ知らせで見たときは外さない）。様子が変わったら SSE の codex_credits で配る
 */
export class CodexCreditsWatch {
  private credits: CodexCredits | null = null;

  constructor(private readonly bus?: Bus) {}

  current(): CodexCredits | null {
    return this.credits;
  }

  /** 知らせを重ねる。クレジットから引かれ始めたか（前は引かれていなかった）を返す（チャットのお知らせに残すかを決めるため） */
  note(input: CreditsNote, at = new Date().toISOString()): boolean {
    const prev = this.credits;
    const before = prev?.balance ?? null;
    const dropped = input.balance !== null && before !== null && input.balance < before;
    let spending = prev?.spending ?? null;
    if (dropped) spending = spending ? { ...spending, to: input.balance as number } : { since: at, from: before, to: input.balance as number };
    else if (input.limit_reached === false) spending = null;
    const next: CodexCredits = {
      has_credits: input.has_credits ?? prev?.has_credits ?? false,
      unlimited: input.unlimited ?? prev?.unlimited ?? false,
      balance: input.balance ?? before,
      spending,
    };
    this.credits = next;
    if (JSON.stringify(prev) !== JSON.stringify(next)) this.bus?.publish({ type: "codex_credits", credits: next });
    return spending !== null && !prev?.spending;
  }
}
