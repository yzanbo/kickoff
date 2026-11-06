import type { ReactNode } from "react";
import { SideSelectionAttach } from "@/features/chat/messages/SelectionAttach";
import { MainChatContext } from "@/features/chat/pane/mainChatContext";

/**
 * 別ウィンドウの中身を、チャットの画面の右の欄と同じく「メインのチャット」（mainChatId。別ウィンドウを開いたチャット）に足せるようにする:
 * 右クリックの「メインのチャット」の組（MainChatContext）と、選んだときの「チャットに追加」（ウィンドウ全体で。足すのはメインのウィンドウのそのチャット）。
 * メインのチャットが分からない（チャットから開いていないメモ）ときは何もしない
 */
export function SideScope({ mainChatId, children }: { mainChatId: number | null; children: ReactNode }) {
  if (mainChatId === null) return children;
  return (
    <MainChatContext.Provider value={mainChatId}>
      {children}
      <SideSelectionAttach mainChatId={mainChatId} container={() => document.body} />
    </MainChatContext.Provider>
  );
}
