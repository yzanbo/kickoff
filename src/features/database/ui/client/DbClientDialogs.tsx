import type { DbConnection, DbImportCandidate } from "@shared/database/types";
import { ConnectionDialog } from "@/features/database/ui/connection/ConnectionDialog";
import { CopyConnectionDialog } from "@/features/database/ui/connection/CopyConnectionDialog";
import { DbFailureDialog } from "@/features/database/ui/connection/DbFailureDialog";
import { DbPrepDialog } from "@/features/database/ui/connection/DbPrepDialog";
import { ImportConnectionDialog } from "@/features/database/ui/connection/ImportConnectionDialog";
import type { DbClientTab } from "@/features/database/ui/dbClientTabs";
import type { DbFailure, DbPrepTarget } from "@/features/database/ui/state/dbClientContext";
import { DbFindPalette } from "./DbFindPalette";

/** DB クライアントで開いているダイアログ（1 度に 1 つ） */
export type DbDialog =
  | { kind: "edit"; connection: DbConnection | null }
  | { kind: "copy" }
  /** 取り込みの画面（Docker タブの「DB で開く」からは、その DB の案を選んだ形で） */
  | { kind: "import"; preselect: DbImportCandidate | null }
  | { kind: "find" }
  | { kind: "failure"; failure: DbFailure }
  | { kind: "prep"; target: DbPrepTarget };

/**
 * DB クライアントのダイアログ。閉じるのは、そのダイアログが開いたままのときだけ
 * （失敗の案内から準備を開くときなど、閉じる知らせより先に次のダイアログに替わっても消さない）
 */
export function DbClientDialogs({
  dialog,
  onChange,
  projectId,
  worktree,
  connections,
  activeTab,
  onImported,
  onNote,
}: {
  dialog: DbDialog | null;
  onChange: (next: (current: DbDialog | null) => DbDialog | null) => void;
  projectId: number;
  worktree: string | null;
  connections: DbConnection[];
  activeTab: DbClientTab | null;
  onImported: (c: DbConnection) => void;
  onNote: (c: DbConnection) => void;
}) {
  if (!dialog) return null;
  const close = () => onChange((current) => (current === dialog ? null : current));
  // 一覧が取り直されたら（手順ノートを結んだ・準備を確かめたなど）新しい方で
  const latest = (c: DbConnection) => connections.find((x) => x.id === c.id) ?? c;
  switch (dialog.kind) {
    case "edit":
      return <ConnectionDialog projectId={projectId} connection={dialog.connection} worktree={worktree} onClose={close} />;
    case "copy":
      return <CopyConnectionDialog projectId={projectId} onClose={close} />;
    case "find":
      return <DbFindPalette connections={connections} activeTab={activeTab} onClose={close} />;
    case "import":
      return <ImportConnectionDialog projectId={projectId} preselect={dialog.preselect} onImported={onImported} onClose={close} />;
    case "failure": {
      const { connection, error, retry } = dialog.failure;
      return (
        <DbFailureDialog
          projectId={projectId}
          connection={latest(connection)}
          error={error}
          onNote={() => onNote(latest(connection))}
          onRetry={retry}
          onPrep={() => onChange(() => ({ kind: "prep", target: { connection, retry } }))}
          onClose={close}
        />
      );
    }
    case "prep":
      return <DbPrepDialog projectId={projectId} connection={latest(dialog.target.connection)} onRetry={dialog.target.retry} onClose={close} />;
  }
}
