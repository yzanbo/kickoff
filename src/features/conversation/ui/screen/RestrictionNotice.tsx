import { TriangleAlert } from "lucide-react";
import { restrictionNotice } from "@shared/chat/restrictionNotice";

/** 制限の緩いチャットでは、送信前にも入力欄に知らせる */
export function RestrictionNotice({ sandboxEnabled, editScopeEnabled, draft = false }: { sandboxEnabled: boolean | undefined; editScopeEnabled: boolean | undefined; draft?: boolean }) {
  const notice = restrictionNotice(sandboxEnabled, editScopeEnabled, draft);
  if (!notice) return null;
  return <p className="composer-notice small warn-text"><TriangleAlert size={13} aria-hidden /><span>{notice}</span></p>;
}
