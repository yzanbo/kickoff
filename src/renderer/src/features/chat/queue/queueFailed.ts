import { reportFailure } from "@/ui/dialogs";

/** 送信待ちの操作の失敗（お知らせのダイアログで出す。送信待ちの部品で共通） */
export const queueFailed = reportFailure("待ちの指示を操作できませんでした");
