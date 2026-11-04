import { Archive } from "lucide-react";
import type { Run } from "@shared/types";
import { api } from "@/api";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { IconButton } from "@/ui/IconButton";

/** 「既読」の列の見出しに置く、列のチャットをすべてアーカイブするボタン（確かめてから。アーカイブ済みは数えない） */
export function ArchiveAllButton({ runs }: { runs: Run[] }) {
  const targets = runs.filter((r) => !r.archived_at);
  if (targets.length === 0) return null;
  return (
    <IconButton
      icon={Archive}
      size={13}
      label="既読をすべてアーカイブ"
      title={`既読の ${targets.length} 件をすべてアーカイブ`}
      onClick={async () => {
        const ok = await confirmDialog({
          title: `既読の ${targets.length} 件をアーカイブしますか？`,
          message: "一覧から隠れます。会話の記録は残り、あとから戻せます。",
          confirmLabel: "すべてアーカイブ",
        });
        if (!ok) return;
        try {
          await Promise.all(targets.map((r) => api.archiveRun(r.id)));
        } catch (e) {
          await alertDialog("アーカイブできませんでした", errorMessage(e));
        }
      }}
    />
  );
}
