// ツールの行の見せ方の表（行の引数・開いた中身・承認カードの中身）。中で持つ見せ方（rowViews/）を先に、上の機能が拡張点 toolRowViews に登録したものを次に引く
import type { ComponentType, ReactNode } from "react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import type { ToolCall } from "@/features/chat/ui";
import { definePoint } from "@/foundation/ui/points";
import { BUILTIN_ROW_VIEWS } from "./rowViews/builtin";

/** 見せ方に渡すもの（input は呼び出しの入力、content は結果の文のうち出すもの。rel はリポジトリの絶対パスを相対パスにする） */
export interface ToolRowProps {
  call: ToolCall;
  input: Record<string, unknown>;
  result: ChatEventOf<"tool_result">["data"] | undefined;
  content: string;
  rel: (s: string) => string;
  /** ファイル名の札（作業場所の中のファイルなら押して開ける。label は札の文） */
  fileArg(path: string, label: string): ReactNode;
}

export interface ToolRowView {
  /** 記録の名前（mcp__kickoff_db__db_query など）か、名前と入力から決める関数 */
  match: string | ((name: string, input: Record<string, unknown>) => boolean);
  /** 行の引数（省けば toolText().describeToolInput） */
  Arg?: ComponentType<ToolRowProps>;
  /** 開いた中身（開いてから作る） */
  Detail?: ComponentType<ToolRowProps>;
  /** 開いた中身を出すか（省けばいつも。出さなければ結果の文だけになる） */
  hasDetail?(props: ToolRowProps): boolean;
  /** 結果の文をどうするか（also: 中身があっても下に出す・never: 出さない（中身が結果も出す）。省けば中身がないか失敗したときだけ） */
  result?: "also" | "never";
  /** 承認カードの中身（省けば toolText().describeApprovalInput の文） */
  ApprovalBody?: ComponentType<{ input: Record<string, unknown>; name: string }>;
}

/** 上の機能が登録する見せ方（database の db_query など） */
export const toolRowViews = definePoint<ToolRowView>("toolRowViews");

const matches = (view: ToolRowView, name: string, input: Record<string, unknown>) => (typeof view.match === "string" ? view.match === name : view.match(name, input));

/** ツールの見せ方（中で持つ表が先、登録したものが後。どれにも合わなければ undefined） */
export function toolRowViewOf(name: string, input: Record<string, unknown>): ToolRowView | undefined {
  return BUILTIN_ROW_VIEWS.find((v) => matches(v, name, input)) ?? toolRowViews.items().find((v) => matches(v, name, input));
}
