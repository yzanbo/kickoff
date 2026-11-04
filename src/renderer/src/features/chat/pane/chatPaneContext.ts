import { createContext, useContext, useSyncExternalStore, type RefObject } from "react";
import type { EffortLevel } from "@shared/types";
import type { ValueCell } from "@/lib/valueCell";
import type { ComposerFill } from "@/features/chat/composer/composerHandle";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { FailedTurn } from "@/features/chat/rewind/retryActions";

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

/** 1 つのチャットの画面の、変わる様子（useChatPaneState で読む） */
export interface ChatPaneState {
  /** 失敗した作業の直し方（作業中・失敗していなければ null） */
  retry: RetryChoices | null;
}

/**
 * 1 つのチャットの画面の操作。流れの項目・ピル・送信待ち・検索・質問のカードなど、子の部品はどれもここから使う（props で中継しない・クラス名で DOM を探さない）。
 * ChatView がチャットごとに 1 回だけ作り、描き直しても同じもの（中身はいつも最新の値で動く）なので、memo した流れの項目に配っても描き直させない。
 * 変わる様子（失敗した作業の直し方）は state に置き、useChatPaneState で読む（変わったときに、読んでいる部品だけが描き直る）
 */
export interface ChatPaneActions {
  readonly chatId: number;
  /** チャットの画面の要素（ピントがこのチャットにあるかを見る・文の幅を測る・検索の印を付ける範囲） */
  readonly root: RefObject<HTMLDivElement | null>;
  /** サブエージェントの中身を、パネルの新しいタブで開く（key = 一覧の行のキー = 起動した呼び出し ID） */
  openSubagent: (key: string) => void;
  /** 自分の発言を書き直して送り直す（確かめ（会話だけ / ファイルも）てから送る。やめたら false。作業中は呼ばない） */
  rewind: (eventId: number, text: string) => Promise<boolean>;
  /** ファイルだけを、その発言を送る前の状態に戻す（会話はそのまま。変わる量を見せて確かめてから） */
  restoreFiles: (eventId: number) => Promise<void>;
  /** 失敗した作業を、続きから再試行する（深さ・モデルを変えるときは、チャット欄の選択も同じに変える） */
  retry: (change?: RetryChange) => void;
  /** その発言へ移って一瞬強調する（一番下への追従をやめ、窓の外なら描いてから。流れにピントを置く） */
  jumpTo: (eventId: number) => void;
  /** その発言を描くようにする（一番下への追従をやめ、窓の外なら窓を動かす。移るのは呼ぶ側。チャットの中の検索） */
  reveal: (eventId: number) => void;
  /** 前（-1）・次（1）の自分の指示へ移る（from: 上に貼り付けた指示。その前後へ。省けば位置で決める） */
  stepPrompt: (dir: -1 | 1, from?: number) => void;
  /** チャット欄に文を入れる（append なら書いている文の後ろに足す） */
  fillComposer: ComposerFill;
  /** チャット欄にピントを移す */
  focusComposer: () => void;
  /** 新しいチャットのタブに文と添付を入れて開く（作成先はこのチャットのプロジェクト・グループ。パネルの外では undefined） */
  readonly askInNewChat?: (seed: NewChatSeed) => void;
  /** 変わる様子 */
  readonly state: ValueCell<ChatPaneState>;
}

/** 1 つのチャットの画面の操作（ChatView が配る。サブエージェントのタブなど、チャットの画面の外では null） */
export const ChatPaneContext = createContext<ChatPaneActions | null>(null);

/** チャットの画面の中だけで使う部品から（外で使うと例外） */
export function useChatPane(): ChatPaneActions {
  const pane = useContext(ChatPaneContext);
  if (!pane) throw new Error("useChatPane はチャットの画面（ChatView）の中で使う");
  return pane;
}

/** チャットの画面の外でも描く部品から（発言・ツールのまとまりなど。外では null で、書き直し・再試行・中身を見るを出さない） */
export const useOptionalChatPane = (): ChatPaneActions | null => useContext(ChatPaneContext);

const noSubscribe = () => () => {};

/** チャットの画面の変わる様子から select で選んだ値（選んだ値が変わったときだけ描き直す。チャットの画面の外では undefined） */
export function useChatPaneState<T>(select: (state: ChatPaneState) => T): T | undefined {
  const pane = useContext(ChatPaneContext);
  return useSyncExternalStore(pane ? pane.state.subscribe : noSubscribe, () => (pane ? select(pane.state.get()) : undefined));
}
