// 書き直し・送り直し・ファイルを戻す・再試行の口（RewindActions。conversation の中だけで読む。実装は rewind/、読むのは messages/ と rewind/ なので、輪にならないよう両方の外に置く）
import { createContext, useContext } from "react";
import type { Attachment } from "@shared/chat/types";
import type { EffortLevel } from "@shared/settings/types";
import type { Cell } from "@/foundation/ui/store";

/** 直す操作を出す失敗の作業: いちばん新しい作業の終わりが失敗で、そのあと発言していないもの（その作業の終わりの記録と、元の自分の発言） */
export interface FailedTurn {
  resultId: number;
  /** その作業を始めた自分の発言（巻き戻して再試行するとき。なければ出さない） */
  prompt?: { eventId: number; text: string };
}

/** 失敗した作業を再試行するときに変えるもの（推論の深さ・モデル） */
export interface RetryChange {
  effort?: EffortLevel;
  model?: string;
}

/** 失敗した作業の直し方の選択肢（いちばん新しい作業が失敗で終わったときだけ） */
export interface RetryChoices {
  failed: FailedTurn;
  /** 1 段下げた推論の深さ（下げられなければ undefined） */
  lower?: EffortLevel;
  /** 切り替えられるモデル（いまのモデルを除く） */
  models: { value: string; label: string }[];
}

export interface RewindActions {
  /** 自分の発言を書き直して送り直す（確かめ（会話だけ / ファイルも）てから送る。やめたら false。作業中は呼ばない） */
  rewind: (eventId: number, text: string) => Promise<boolean>;
  /**
   * 自分の発言を、新しい指示としてもう一度送る（文と添付をそのまま。前のやり取りは消さない）。
   * 送り方はチャット欄の送信と同じ（作業中・送信待ちがあれば、チャット欄の切り替え（いま / あとで）。圧縮中の「いま」は圧縮が終わってから伝わる）
   */
  resend: (text: string, attachments: Attachment[]) => Promise<void>;
  /** ファイルだけを、その発言を送る前の状態に戻す（会話はそのまま。変わる量を見せて確かめてから） */
  restoreFiles: (eventId: number) => Promise<void>;
  /** 失敗した作業を、続きから再試行する（深さ・モデルを変えるときは、チャット欄の選択も同じに変える） */
  retry: (change?: RetryChange) => void;
  /** 失敗した作業の直し方（作業中・失敗していなければ null） */
  readonly choices: Cell<RetryChoices | null>;
}

export const RewindActionsContext = createContext<RewindActions | null>(null);

/** 書き直し・再試行の口（チャットの画面の外では null で、書き直し・再試行を出さない） */
export const useRewindActions = (): RewindActions | null => useContext(RewindActionsContext);
