import type { Attachment } from "@shared/chat/types";

/**
 * 承認の拒否の欄の計算: 送る理由（前後の空白を除いた文と、アップロードできた添付。どちらもなければ省く）と、拒否のボタンの文言・押せるか。
 * 理由も添付もなければ「理由なしで拒否」（押せば AI には既定の「拒否しました」が届く）。アップロードの途中は、添付を落とさないよう押せない
 */
export function denyFormModel({ message, attachments, uploading }: { message: string; attachments: readonly Attachment[]; uploading: boolean }) {
  const text = message.trim();
  const withReason = text !== "" || attachments.length > 0;
  return {
    reason: { ...(text ? { message: text } : {}), ...(attachments.length > 0 ? { attachments: [...attachments] } : {}) },
    canDeny: !uploading,
    label: withReason ? "理由を添えて拒否" : "理由なしで拒否",
    title: uploading ? "添付のアップロードが終わるまで待ってください" : withReason ? "書いた理由と添付を AI に伝えて拒否する" : "理由を伝えずに拒否する",
  };
}
