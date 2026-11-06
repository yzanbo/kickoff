import { createContext, useContext, useEffect, useSyncExternalStore, type RefObject } from "react";
import type { Attachment, EffortLevel } from "@shared/types";
import type { ValueCell } from "@/lib/valueCell";
import type { ComposerFill } from "@/features/chat/composer/composerHandle";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import type { FailedTurn } from "@/features/chat/rewind/retryActions";
import type { ActivityFilter } from "@/features/chat/activity/activityRows";

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

/** チャットの画面の見え方（会話 = 発言の流れ / 動き = メインとすべてのサブエージェントの動きを 1 本の時系列に） */
export type ChatShowing = "conversation" | "activity";

/** 1 つのチャットの画面の、変わる様子（useChatPaneState で読む） */
export interface ChatPaneState {
  /** 失敗した作業の直し方（作業中・失敗していなければ null） */
  retry: RetryChoices | null;
  /** 開いているサブエージェントのカード（行のキー） */
  openSubagents: ReadonlySet<string>;
  /** 高さの制限を外して、中身をすべて流れに出しているカード（「全体を表示」。行のキー） */
  fullSubagents: ReadonlySet<string>;
  /** 会話と動きのどちらを見せているか（見出しの「会話 / 動き」） */
  showing: ChatShowing;
  /** 動きの絞り込み（すべて・メインだけ・そのサブエージェントと配下） */
  activityFilter: ActivityFilter;
  /**
   * 動きで強調しているサブエージェント（カードの「動きで見る」。その配下ごとの行を強調して、順に移る）。
   * nonce は押すたびに増やす（同じサブエージェントでもう一度押したら、また初めの行へ移る）。強調していなければ null
   */
  activityFocus: { key: string; nonce: number } | null;
  /** 「伝える」の入力欄を開いているサブエージェントのカード（行のキー。カードのいちばん下に開く） */
  tellOpen: ReadonlySet<string>;
}

/**
 * 1 つのチャットの画面の操作。流れの項目・ピル・送信待ち・検索・質問のカードなど、子の部品はどれもここから使う（props で中継しない・クラス名で DOM を探さない）。
 * ChatView がチャットごとに 1 回だけ作り、描き直しても同じもの（中身はいつも最新の値で動く）なので、memo した流れの項目に配っても描き直させない。
 * 変わる様子（失敗した作業の直し方）は state に置き、useChatPaneState で読む（変わったときに、読んでいる部品だけが描き直る）
 */
export interface ChatPaneActions {
  readonly chatId: number;
  /** いまのプロジェクト（チャットをほかのプロジェクトへ移すと変わる。メモに追加する先） */
  projectId: () => number;
  /** チャットの画面の要素（ピントがこのチャットにあるかを見る・文の幅を測る・検索の印を付ける範囲） */
  readonly root: RefObject<HTMLDivElement | null>;
  /**
   * サブエージェントのカードへ移って開く（入れ子なら外側のカードも開く。key = 一覧の行のキー = 起動した呼び出し ID）。
   * eventId を渡すと、カードの中のその記録（発言・ツールのまとまり）へ移る。動きを見せていれば会話に戻す
   */
  revealSubagent: (key: string, eventId?: number) => void;
  /**
   * サブエージェントを、設定の開き方（SUBAGENT_OPEN_IN）で開く: 流れの中 = そのカードへ移って開く（revealSubagent）/
   * 右の欄 = チャットの画面の右の欄にそのサブエージェントの画面を開く（openSubagentSide）/ 別ウィンドウ（openSubagentWindow）。
   * eventId を渡すと、その中のその記録へ移る（別ウィンドウでは移らない）
   */
  openSubagent: (key: string, eventId?: number) => void;
  /**
   * チャットの画面の右の欄（サブエージェントの欄）に、そのサブエージェントの画面を開く（開いていればそのタブを表示）。
   * eventId を渡すと、その画面の中のその記録へ移る。右の欄を置けない画面（パネルの外）では、流れの中のカードへ移る
   */
  openSubagentSide: (key: string, eventId?: number) => void;
  /** そのサブエージェントの画面を別ウィンドウで開く（もう開いていれば前に出す。別ウィンドウを開けなければ右の欄） */
  openSubagentWindow: (key: string) => void;
  /** 右の欄を置ける画面か（パネルの中のチャット。外では「右の欄で開く」を出さない） */
  readonly canOpenSide: boolean;
  /** サブエージェントのカードを開く・閉じる（open を省けば切り替え） */
  toggleSubagent: (key: string, open?: boolean) => void;
  /** カードの中身の高さの制限を外す・戻す（「全体を表示」） */
  toggleSubagentFull: (key: string) => void;
  /** 会話・動きを切り替える（動きは filter を渡せば、その絞り込みで） */
  show: (showing: ChatShowing, filter?: ActivityFilter) => void;
  /** 絞り込まない動きを開き、そのサブエージェントと配下の行をすべて強調して、初めの行へ移る（カードの「動きで見る」） */
  focusActivity: (key: string) => void;
  /** 動きの強調をやめる */
  clearActivityFocus: () => void;
  /**
   * 会話に戻って、その記録へ移って強調する（agent を渡せば、そのサブエージェントを設定の開き方で開いてその中へ: 流れの中 = カードを開いてその中へ /
   * 右の欄 = 右の欄のその画面の中へ。右の欄のときは、会話に戻さず動きを見せたまま）
   */
  revealInConversation: (eventId: number | undefined, agent: string | null) => void;
  /**
   * そのサブエージェントのカードのいちばん下に「伝える」の入力欄を開く（送るとメインエージェントから SendMessage で伝える）。
   * 書いている欄が流れていかないよう、流れの一番下への付いていきを止める
   */
  tellSubagent: (key: string) => void;
  /** カードの「伝える」の入力欄を閉じる（送った・やめた。書きかけの文は残る） */
  closeTell: (key: string) => void;
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

/** 1 つのチャットの画面の操作（ChatView が配る。チャットの画面の外では null） */
export const ChatPaneContext = createContext<ChatPaneActions | null>(null);

/** チャットの画面の中だけで使う部品から（外で使うと例外） */
export function useChatPane(): ChatPaneActions {
  const pane = useContext(ChatPaneContext);
  if (!pane) throw new Error("useChatPane はチャットの画面（ChatView）の中で使う");
  return pane;
}

/** チャットの画面の外でも描く部品から（発言・ツールのまとまりなど。外では null で、書き直し・再試行・カードの開閉を出さない） */
export const useOptionalChatPane = (): ChatPaneActions | null => useContext(ChatPaneContext);

const noSubscribe = () => () => {};

/** チャットの画面の変わる様子から select で選んだ値（選んだ値が変わったときだけ描き直す。チャットの画面の外では undefined） */
export function useChatPaneState<T>(select: (state: ChatPaneState) => T): T | undefined {
  const pane = useContext(ChatPaneContext);
  return useSyncExternalStore(pane ? pane.state.subscribe : noSubscribe, () => (pane ? select(pane.state.get()) : undefined));
}

/**
 * パネルのタブごとの、開いているチャットの画面の操作（タブの右クリックから会話 / 動きを切り替えるため。見出しを隠していても切り替えられるように）。
 * 置き場所は chatPaneSlot(パネル, タブ)。同じチャットをほかの欄でも開いていることがあるので、チャットの ID ではなくタブで引く
 */
const slots = new Map<string, ChatPaneActions>();

export const chatPaneSlot = (panelKey: string, tabKey: string) => `${panelKey}\n${tabKey}`;

/** そのタブで描いているチャットの画面の操作（描いていなければ undefined） */
export const chatPaneAt = (slot: string): ChatPaneActions | undefined => slots.get(slot);

/** チャットの画面を、そのタブの置き場所に登録する（描いている間だけ） */
export function useChatPaneSlot(slot: string | undefined, pane: ChatPaneActions) {
  useEffect(() => {
    if (!slot) return;
    slots.set(slot, pane);
    return () => {
      if (slots.get(slot) === pane) slots.delete(slot);
    };
  }, [slot, pane]);
}
