// notes が window.kickoff を読む所（Mac のアプリの中だけ使える、フォルダを選ぶダイアログ）
/** フォルダを選ぶダイアログを出せるか（Mac のアプリの中だけ） */
export const canPickFolder = () => typeof window !== "undefined" && window.kickoff !== undefined;

/** フォルダを選ぶダイアログ（選ばなければ null） */
export const pickFolder = async (title: string): Promise<string | null> => (await window.kickoff?.dialog.pickFolder(title)) ?? null;
