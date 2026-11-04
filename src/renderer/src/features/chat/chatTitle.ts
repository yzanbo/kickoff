/** チャットの名前の文字数の上限（サーバーの入力の検証と同じ） */
export const CHAT_TITLE_MAX = 100;

/** チャットの名前（まだ付いていなければ「無題のチャット」） */
export function chatTitle(title: string | null | undefined): string {
  return title || "無題のチャット";
}

/** 送る前の新しいチャット（下書き）の名前（タブ・サイドバー・ボードに出すので短く） */
export const NEW_CHAT_TITLE = "new チャット";
