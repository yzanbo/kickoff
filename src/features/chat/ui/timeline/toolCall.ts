// 流れの項目の型のうち、下の機能（サブエージェント・図）も読むもの
import type { ReactNode } from "react";
import type { ChatEvent, ChatEventOf } from "@shared/chat/chatEvent";

/** ツールの呼び出しと、届いていればその結果 */
export interface ToolCall {
  use: ChatEventOf<"tool_use">;
  result?: ChatEventOf<"tool_result">;
}

/**
 * サブエージェントのカードの中の流れを描く関数（記録をまとめて描くのは描く側。流れの部品を下の機能から読むと輪になるので、描く側から渡す）。
 * scope はそのサブエージェントの流れ（行のキーと、再開した回の呼び出し ID）、active は結果の届いていないツールを実行中に見せるか、
 * empty は項目が 1 つもないときに代わりに出すもの
 */
export type RenderScope = (events: readonly ChatEvent[], scope: readonly string[], active: boolean, empty: ReactNode) => ReactNode;
