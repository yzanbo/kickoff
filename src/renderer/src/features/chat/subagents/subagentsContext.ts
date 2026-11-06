import { createContext, useContext } from "react";
import type { ChatEvent } from "@shared/types";
import type { SubagentTree } from "./subagentTree";

/**
 * チャットのサブエージェント（流れの中のカード・終わりの 1 行が読む）。記録・一覧が変わるたびに新しい値になり、
 * 読んでいるカードだけが描き直る（memo した発言・ツールのまとまりは描き直さない）
 */
export interface SubagentsView {
  chatId: number;
  /** チャットのプロジェクトと作業場所（右の欄の入力欄の / と @ の候補を探す場所。本体なら null） */
  projectId: number;
  worktree: string | null;
  /** リポジトリの絶対パスを相対パスにする（右の欄のサブエージェントの画面の流れに使う。作業場所が変わらない間は同じ関数） */
  rel: (s: string) => string;
  /** メインエージェントが作業中か */
  busy: boolean;
  events: ChatEvent[];
  tree: SubagentTree;
  /** サブエージェントの色相（起動した順。カードの縦線・目次の点・動きの線で同じ色。agentHues） */
  hues: ReadonlyMap<string, number>;
}

/** ChatView が配る（チャットの画面の外では null） */
export const SubagentsContext = createContext<SubagentsView | null>(null);

export const useSubagentsView = (): SubagentsView | null => useContext(SubagentsContext);
