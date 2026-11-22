// チャットの画面の操作の口（型・context・hook）。実装は持ち主の conversation が作り、ChatScreen がチャットごとに 1 回だけ作って配る
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Attachment } from "@shared/chat/types";
import type { Cell } from "@/foundation/ui/store";
import { screenAt, type ShownScreen } from "./chatScreens";

/** 動きの絞り込み（すべて・メインだけ・そのサブエージェントと配下） */
export type ActivityFilter = { kind: "all" } | { kind: "main" } | { kind: "agent"; key: string };

/** チャットの画面の見え方（会話 = 発言の流れ / 動き = メインとすべてのサブエージェントの動きを 1 本の時系列に） */
export type ChatShowing = "conversation" | "activity";

/**
 * 動きで強調しているサブエージェント（カードの「動きで見る」。その配下ごとの行を強調して、順に移る）。
 * nonce は押すたびに増やす（同じサブエージェントでもう一度押したら、また初めの行へ移る）
 */
export interface ActivityFocus {
  key: string;
  nonce: number;
}

/** 流れの中を移る口（conversation/timeline が作る）。どれも描き直しても同じ物で、中身はいつも最新の値で動く */
export interface TimelineNav {
  /** その発言へ移って一瞬強調する（一番下への追従をやめ、窓の外なら描いてから。流れにピントを置く） */
  jumpTo: (eventId: number) => void;
  /** その発言を描く（一番下への追従をやめ、読んでいなければ読み、窓の外なら前後を描く）。描いて測り終えたら解決する。移るのは呼ぶ側（チャットの中の検索） */
  reveal: (eventId: number) => Promise<void>;
  /** 前（-1）・次（1）の自分の指示へ移る（from: 上に貼り付けた指示。その前後へ。省けば位置で決める） */
  stepPrompt: (dir: -1 | 1, from?: number) => void;
  /** チャットの中の検索で探す、末尾より前の本文（自分の発言とメインの返答。末尾から読んでいれば空） */
  searchTexts: () => Promise<ChatEvent[]>;
  /** 流れの窓が描く行を変えて描き終えた回数（チャットの中の検索が、見出しを通さずに購読して印を付け直す） */
  readonly drawn: Cell<number>;
  /** 遠い記録へ移るために読んでいる記録の ID（読むのが 150ms を超えたときだけ。押した所に回る印を出す） */
  readonly jumping: Cell<number | null>;
}

/**
 * サブエージェントを開く口（conversation/screen が作る。別ウィンドウのサブエージェントの画面は、メインのウィンドウに頼む口に差し替える）。
 * key は一覧の行のキー（= 起動した呼び出し ID）
 */
export interface SubagentNav {
  /**
   * 設定の開き方（SUBAGENT_OPEN_IN）で開く: 流れの中 = そのカードへ移って開く（reveal）/ 右の欄（openSide）/ 別ウィンドウ（openWindow）。
   * eventId を渡すと、その中のその記録へ移る（別ウィンドウでは移らない）
   */
  open: (key: string, eventId?: number) => void;
  /**
   * チャットの画面の右の欄に、そのサブエージェントの画面を開く（開いていればそのタブを表示）。
   * eventId を渡すと、その画面の中のその記録へ移る。右の欄を置けない画面（パネルの外）では、流れの中のカードへ移る
   */
  openSide: (key: string, eventId?: number) => void;
  /** そのサブエージェントの画面を別ウィンドウで開く（もう開いていれば前に出す。別ウィンドウを開けなければ右の欄） */
  openWindow: (key: string) => void;
  /** サブエージェントのカードへ移って開く（入れ子なら外側のカードも開く）。eventId を渡すと、カードの中のその記録へ移る。動きを見せていれば会話に戻す */
  reveal: (key: string, eventId?: number) => void;
  /** カードを開く・閉じる（open を省けば切り替え） */
  toggle: (key: string, open?: boolean) => void;
  /** カードの中身の高さの制限を外す・戻す（「全体を表示」） */
  toggleFull: (key: string) => void;
  /**
   * そのサブエージェントのカードのいちばん下に「伝える」の入力欄を開く（送るとメインエージェントから SendMessage で伝える）。
   * 書いている欄が流れていかないよう、流れの一番下への付いていきを止める
   */
  tell: (key: string) => void;
  /** カードの「伝える」の入力欄を閉じる（送った・やめた。書きかけの文は残る） */
  closeTell: (key: string) => void;
  /** 「伝える」の入力欄を開いているカード（行のキー。カードのいちばん下に開く） */
  readonly tellOpen: Cell<ReadonlySet<string>>;
  /** 右の欄を置ける画面か（パネルの中のチャット。外では「右の欄で開く」を出さない） */
  readonly canOpenSide: boolean;
}

/** 会話と動きを切り替える口（conversation/activity が作る） */
export interface ActivityNav {
  /** 会話・動きを切り替える（動きは filter を渡せば、その絞り込みで） */
  show: (showing: ChatShowing, filter?: ActivityFilter) => void;
  /** 絞り込まない動きを開き、そのサブエージェントと配下の行をすべて強調して、初めの行へ移る（カードの「動きで見る」） */
  focus: (key: string) => void;
  /** 動きの強調をやめる */
  clearFocus: () => void;
  /**
   * 会話に戻って、その記録へ移って強調する（agent を渡せば、そのサブエージェントを設定の開き方で開いてその中へ: 流れの中 = カードを開いてその中へ /
   * 右の欄 = 右の欄のその画面の中へ。右の欄のときは、会話に戻さず動きを見せたまま）
   */
  revealInConversation: (eventId: number | undefined, agent: string | null) => void;
  /** 会話と動きのどちらを見せているか（見出しの「会話 / 動き」） */
  readonly showing: Cell<ChatShowing>;
  readonly filter: Cell<ActivityFilter>;
  /** 強調しているサブエージェント（強調していなければ null） */
  readonly focused: Cell<ActivityFocus | null>;
}

/**
 * 外から入力欄に文を入れる（append: 書いている文の後ろに空行を挟んで足す。なければ置き換える。
 * attachments: アップロード済みの添付も足す。focus: false なら入力欄にピントを移さない（隠れているタブに書きかけを戻すとき））
 */
export type ComposerFill = (text: string, opts?: { append?: boolean; attachments?: Attachment[]; focus?: boolean }) => void;

/** チャットの入力欄の仮の口（入力欄の下書きの店ができるまで。ChatScreen が入力欄の handleRef から作る） */
export interface ComposerPort {
  /** チャット欄に文を入れる（append なら書いている文の後ろに足す） */
  fill: ComposerFill;
  /** チャット欄にピントを移す */
  focus: () => void;
}

export const TimelineNavContext = createContext<TimelineNav | null>(null);
export const SubagentNavContext = createContext<SubagentNav | null>(null);
export const ActivityNavContext = createContext<ActivityNav | null>(null);
export const ComposerPortContext = createContext<ComposerPort | null>(null);

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} はチャットの画面（ChatScreen）の中で使う`);
  return value;
}

/** 流れの中を移る口（チャットの画面の中だけで使う部品から。外で使うと例外） */
export const useTimelineNav = (): TimelineNav => required(useContext(TimelineNavContext), "useTimelineNav");
/** 流れの中を移る口（チャットの画面の外・別ウィンドウのサブエージェントの画面では null） */
export const useOptionalTimelineNav = (): TimelineNav | null => useContext(TimelineNavContext);
/** サブエージェントを開く口（外で使うと例外） */
export const useSubagentNav = (): SubagentNav => required(useContext(SubagentNavContext), "useSubagentNav");
/** サブエージェントを開く口（チャットの画面の外では null） */
export const useOptionalSubagentNav = (): SubagentNav | null => useContext(SubagentNavContext);
/** 会話と動きを切り替える口（外で使うと例外） */
export const useActivityNav = (): ActivityNav => required(useContext(ActivityNavContext), "useActivityNav");
/** 会話と動きを切り替える口（チャットの画面の外では null） */
export const useOptionalActivityNav = (): ActivityNav | null => useContext(ActivityNavContext);
/** 入力欄の仮の口（チャットの画面の外では null） */
export const useComposerPort = (): ComposerPort | null => useContext(ComposerPortContext);

const noSubscribe = () => () => {};

/** 口の変わる値から select で選んだ値（選んだ値が変わったときだけ描き直す。口がなければ fallback） */
export function usePortValue<T, S>(cell: Cell<T> | undefined, select: (value: T) => S, fallback: S): S {
  return useSyncExternalStore(cell ? cell.subscribe : noSubscribe, () => (cell ? select(cell.get()) : fallback));
}

/** パネルのタブの置き場所（チャットの ID ではなくタブで引く。同じチャットをほかの欄でも開いていることがあるため） */
export const chatPaneSlot = (panelKey: string, tabKey: string) => `${panelKey}\n${tabKey}`;

/** そのタブで描いているチャットの画面（描いていなければ undefined。登録簿は chatScreens.ts。panel が読む中継の名前で、panel のタブの中身を移すときに消す） */
export const chatPaneAt = (slot: string): ShownScreen | undefined => screenAt(slot);
