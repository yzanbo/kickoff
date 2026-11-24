// ノートのウィンドウ間の知らせ（WindowMessageMap に足す。受けるのはメインのウィンドウの ./appHosts.ts）
export {};

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウでそのノートを開く（chatId があればそのチャットの右の欄、なければノートのタブ。別ウィンドウの返答から「ノートに追加」したとき。openNote.ts） */
    openNote: { projectId: number; path: string; chatId: number | null };
    /** ノート（フォルダならその中）の名前を変えた・動かした（toProjectId は欄の間で動かしたときの行き先）。別ウィンドウで開いているノートが付いていく（NotePopoutPage） */
    noteMoved: { projectId: number; from: string; toProjectId: number; to: string };
  }
}
