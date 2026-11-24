import { Archive } from "lucide-react";
import type { Chat } from "@shared/chat/types";
import { chatsApi } from "@/features/chat/ui";
import { alert, confirm } from "@/foundation/ui/kit/ask";
import { errorMessage } from "@shared/foundation/errors";
import { IconButton } from "@/foundation/ui/kit/IconButton";

/** 「既読」の列の見出しに置く、列のチャットをすべてアーカイブするボタン（確かめてから。アーカイブ済みは数えない） */
export function ArchiveAllButton({ chats }: { chats: Chat[] }) {
  const targets = chats.filter((r) => !r.archived_at);
  if (targets.length === 0) return null;
  return (
    <IconButton
      icon={Archive}
      iconSize={13}
      label="既読をすべてアーカイブ"
      title={`既読の ${targets.length} 件をすべてアーカイブ`}
      onClick={async () => {
        const ok = await confirm({
          title: `既読の ${targets.length} 件をアーカイブしますか？`,
          message: "一覧から隠れます。会話の記録は残り、あとから戻せます。",
          confirmLabel: "すべてアーカイブ",
        });
        if (!ok) return;
        // 1 件が失敗しても残りはアーカイブし、失敗した件数と最初の理由を知らせる
        const results = await Promise.allSettled(targets.map((r) => chatsApi.archiveChat(r.id)));
        const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        if (failed.length > 0) await alert(`${targets.length} 件のうち ${failed.length} 件をアーカイブできませんでした`, errorMessage(failed[0].reason));
      }}
    />
  );
}
