/** チャットの名前（まだ付いていなければ「無題のチャット」） */
export function chatTitle(title: string | null | undefined): string {
  return title || "無題のチャット";
}
