// 子チャットのウィンドウ間の知らせ（WindowMessageMap に足す。送るのは別ウィンドウの中の @/features/chat/ui/open/openChat.ts、受けるのはメインのウィンドウの ./appHosts.ts）
import { type AskChildTarget } from "@/features/chat/ui";

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウで子チャットを開く（設定が右の欄のとき。別ウィンドウの子チャットの札・通知から） */
    openChild: { chatId: number };
    /** メインのウィンドウで、そのチャットの新しい子チャットのタブを開く（別ウィンドウの「新しい子チャットで聞く」「子チャットを作成」。openAskChild） */
    askChild: AskChildTarget;
    /** 別ウィンドウの子チャットから親へ: 親の聞いた位置を見る（reveal）/ 答えを親の入力欄に入れる（handBack） */
    childToParent: { childId: number; action: "reveal" | "handBack"; text?: string };
  }
}
