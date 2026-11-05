import { createContext, useContext } from "react";
import type { ChatEvent } from "@shared/types";
import type { SubagentTree } from "./subagentTree";

/**
 * チャットのサブエージェント（流れの中のカード・終わりの 1 行が読む）。記録・一覧が変わるたびに新しい値になり、
 * 読んでいるカードだけが描き直る（memo した発言・ツールのまとまりは描き直さない）
 */
export interface SubagentsView {
  chatId: number;
  /** メインのエージェントが作業中か */
  busy: boolean;
  events: ChatEvent[];
  tree: SubagentTree;
}

/** ChatView が配る（チャットの画面の外では null） */
export const SubagentsContext = createContext<SubagentsView | null>(null);

export const useSubagentsView = (): SubagentsView | null => useContext(SubagentsContext);
