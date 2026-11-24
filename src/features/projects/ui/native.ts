// projects が window.kickoff を読む所（Mac のアプリの中だけ使える、フォルダ・参照を選ぶダイアログ）
import type { PickFolderOptions } from "@shared/foundation/ipc";

/** フォルダを選ぶダイアログ（選ばなければ・Mac のアプリの外なら null） */
export const pickFolder = async (title: string, options?: PickFolderOptions): Promise<string | null> => (await window.kickoff?.dialog.pickFolder(title, options)) ?? null;

/** 参照に足すファイル・フォルダを選ぶダイアログ（選ばなければ・Mac のアプリの外なら空） */
export const pickReferences = async (): Promise<string[]> => (await window.kickoff?.dialog.pickReferences()) ?? [];
