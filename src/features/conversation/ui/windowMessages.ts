// 会話の画面のウィンドウ間の知らせ（WindowMessageMap に足す。送るのは別ウィンドウのサブエージェント、受けるのはメインのウィンドウのチャットの画面 @/features/chat/ui/screen/chatScreens.ts）
export {};

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウのそのチャットの会話のその場所へ移る（agent があれば、そのサブエージェントを設定の開き方で開いてその中へ） */
    reveal: { chatId: number; eventId?: number; agent: string | null };
    /** メインのウィンドウのそのチャットの「動き」を、そのサブエージェントに絞って開く */
    showActivity: { chatId: number; agent: string };
  }
}
