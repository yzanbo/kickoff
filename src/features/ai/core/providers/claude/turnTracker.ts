// 1 回の実行の記録係（SDK のメッセージを 1 件ずつ受けて、知らせることと終わりの結果を決める。純粋。時計は now で受ける）
import { overageInUseOf, type SDKMessage, type SDKResultMessage } from "./wire";
import { errorMessage } from "@shared/foundation/errors";
import { isNetworkError } from "@shared/ai/networkErrors";
import { isUsageLimitError, resetTimeOf } from "@/features/ai/core/providers/shared/usageLimit";
import type { ProviderCallbacks, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { ERROR_LABELS, FAST_MODE_REASONS } from "./labels";
import { confirmedClaudeMissingResume } from "./missingResume";
import { replyText } from "./preCompact";

/** 再試行の知らせ（口の retry の引数） */
type RetryNote = Parameters<NonNullable<ProviderCallbacks["retry"]>>[0];

/** 1 件のメッセージで分かったこと（そのメッセージで変わったものだけ） */
export interface TrackerNotes {
  /** 通信の再試行の知らせ（null = 返答が届き始めて再試行が終わった） */
  retry?: RetryNote;
  /** いま超過分（追加の使用枠。使った分の支払い）で動いているか */
  overage?: boolean;
  /** メインエージェントの応答（コンテキストの大きさと文。圧縮前指示の門へ） */
  reply?: { tokens: number; text: string | null };
  /** 圧縮の区切り（要約したあとの大きさ。分からなければ null） */
  compacted?: number | null;
  /** 画面に知らせるコンテキストの大きさ */
  context?: number;
}

/** 実行の終わり方（thrown = 繰り返しが例外で終わった） */
export type TrackerEnd = { aborted: boolean } | { aborted: boolean; thrown: unknown };

export function createTurnTracker(resumeSessionId: string | null, now: () => Date = () => new Date()) {
  let sessionId = resumeSessionId;
  let final: SDKResultMessage | undefined;
  let seenOtherMessage = false;
  // メインエージェントの最後の応答で、コンテキストに入っていたトークン数
  let contextTokens: number | undefined;
  // 要約したあとの大きさが分からず、次のメインの応答で知らせるところか
  let contextAfterCompact = false;
  // メインの会話の最後のメッセージの ID（分岐の位置。結果に残す）
  let lastMessageId: string | undefined;
  // 通信を再試行しているところか（返答が届き始めたら終わり）と、応答のないまま再試行したことがあるか（通信の切断の目印）
  let retrying = false;
  let noResponse = false;
  // 使用枠の上限で断られたか（rate_limit_event の rejected・返答のエラー）と、枠が戻る時刻
  let limited = false;
  let limitResetsAt: string | null = null;

  /** 失敗が通信の切断によるものか */
  const network = (error: string | undefined) => noResponse || isNetworkError(error);
  /** 失敗が使用枠の上限によるものなら、枠が戻る時刻を添える */
  const usageLimit = (error: string | undefined) => (limited || isUsageLimitError(error) ? { usageLimit: { resetsAt: limitResetsAt } } : {});

  return {
    note(msg: SDKMessage): TrackerNotes {
      const notes: TrackerNotes = {};
      if (msg.type !== "result") seenOtherMessage = true;
      // 通信の再試行: 画面に回数と次に送り直すまでの時間を知らせる（応答がない = 通信が切れている）
      if (msg.type === "system" && msg.subtype === "api_retry") {
        retrying = true;
        if (msg.error_status === null) noResponse = true;
        notes.retry = { attempt: msg.attempt, max_retries: msg.max_retries, retry_delay_ms: msg.retry_delay_ms, at: now().toISOString() };
      } else if (retrying && (msg.type === "assistant" || msg.type === "stream_event")) {
        retrying = false;
        notes.retry = null;
      }
      if (msg.type === "rate_limit_event") {
        if (msg.rate_limit_info.status === "rejected") {
          limited = true;
          limitResetsAt = resetTimeOf(msg.rate_limit_info.resetsAt) ?? limitResetsAt;
        }
        // いま超過分で動いているか（意図せず課金していないかを下の帯で見せる）
        const overage = overageInUseOf(msg.rate_limit_info);
        if (overage !== null) notes.overage = overage;
      }
      if (msg.type === "assistant" && msg.error === "rate_limit") limited = true;
      // メインの会話の最後のメッセージ（ここから分岐するときの位置）
      if ((msg.type === "assistant" || msg.type === "user") && msg.parent_tool_use_id === null && msg.uuid) lastMessageId = msg.uuid;
      if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;
      if (msg.type === "result") final = msg;
      if (msg.type === "assistant" && msg.parent_tool_use_id === null) {
        const u = msg.message.usage;
        contextTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + u.output_tokens;
        notes.reply = { tokens: contextTokens, text: replyText(msg.message.content) };
        // 要約したあとの大きさが分からなかったときは、要約のあとの最初の応答で知らせる
        if (contextAfterCompact) {
          contextAfterCompact = false;
          notes.context = contextTokens;
        }
      }
      // 要約したあとのコンテキストの大きさ。作業の終わりを待たずに知らせる（自動の圧縮は作業の途中で起き、そのあとも作業が続くため）
      if (msg.type === "system" && msg.subtype === "compact_boundary") {
        const post = msg.compact_metadata.post_tokens;
        notes.compacted = post ?? null;
        if (post !== undefined) {
          contextTokens = post;
          notes.context = post;
        } else contextAfterCompact = true;
      }
      return notes;
    },

    /** ファストモードを指定したのに使われなかったときの、チャットに残す理由（使われた・結果がない・指定していなければ null） */
    fastModeNotice(fastMode: boolean): string | null {
      if (!fastMode || !final || final.fast_mode_state === "on" || !final.fast_mode_disabled_reason) return null;
      return `ファストモードは使われませんでした（${FAST_MODE_REASONS[final.fast_mode_disabled_reason] ?? final.fast_mode_disabled_reason}）`;
    },

    /** 実行の結果（止められたら cancelled。失敗は投げずに理由・通信の切断・使用枠の上限を添える） */
    result(end: TrackerEnd): ProviderTurnResult {
      if (end.aborted) return { status: "cancelled", sessionId, lastMessageId };
      if ("thrown" in end) {
        const error = errorMessage(end.thrown);
        const missing = confirmedClaudeMissingResume(end.thrown, resumeSessionId, final, seenOtherMessage);
        return { status: "failed", sessionId, error, lastMessageId, ...(missing ? { resumeSessionMissing: true as const } : {}), network: network(error), ...usageLimit(error) };
      }
      if (!final) return { status: "failed", sessionId, error: "エージェントが結果を返さずに終了しました", lastMessageId, network: noResponse };
      // 上限は、使ったモデルのうちいちばん大きいコンテキストウィンドウ（サブエージェントの小さいモデルを除くため）
      const windows = Object.values(final.modelUsage ?? {}).map((m) => m.contextWindow).filter((w) => w > 0);
      const context = contextTokens === undefined ? undefined : { tokens: contextTokens, window: windows.length ? Math.max(...windows) : null };
      const common = { sessionId: final.session_id ?? sessionId, costUsd: final.total_cost_usd, turns: final.num_turns, context, lastMessageId };
      if (final.subtype === "success" && !final.is_error) return { ...common, status: "completed", result: final.result };
      const error = final.subtype === "success" ? final.result : final.errors?.join("\n") || ERROR_LABELS[final.subtype] || final.subtype;
      return { ...common, status: "failed", error, network: network(error), ...usageLimit(error) };
    },
  };
}
