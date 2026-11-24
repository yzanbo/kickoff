import { createContext, useContext } from "react";

/**
 * 流れのチャットのメインエージェントが作業中か（ChatTimeline・右の欄のサブエージェントの画面が配る。外では false）。
 * 流れの項目の props では渡さない（作業の始まりと終わりで memo した項目がすべて描き直り、返答の Markdown を解析し直すため）。
 * 読むのは、作業中に押せなくする小さな部品（発言の書き直し・ファイルを戻す・作業の終わりの行の分岐・依頼文のボタン）だけ
 */
export const TimelineBusyContext = createContext(false);

export const useTimelineBusy = (): boolean => useContext(TimelineBusyContext);
