import { useState, type FormEvent } from "react";
import { errorMessage } from "@shared/errors";
import type { DbSsh } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";

/**
 * 初めてつなぐ踏み台のサーバーの鍵を確かめるダイアログ（SSH トンネルの失敗の印 DB_SSH_UNKNOWN_HOST から）。
 * 鍵の指紋を見せ、「受け入れてつなぐ」で ~/.ssh/known_hosts に足して（ターミナルの ssh と同じ場所）つなぎ直す
 */
export function SshHostKeyDialog({ projectId, ssh, onAccepted, onClose }: { projectId: number; ssh: DbSsh; onAccepted: () => void; onClose: () => void }) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const scan = useAsync(() => api.dbSshHostKey(projectId, ssh), [projectId, ssh.host, ssh.port, ssh.user, ssh.identity_file]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const accept = async (e: FormEvent) => {
    e.preventDefault();
    if (!scan.data) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.acceptDbSshHostKey(
        projectId,
        ssh,
        scan.data.keys.map((k) => k.fingerprint),
      );
      dialog.close();
      onAccepted();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog.ref}
      className="dialog app-dialog db-ssh-key-dialog"
      aria-label="踏み台のサーバーの鍵を確かめる"
      // 接続のダイアログの中に開くので、閉じた知らせを外のダイアログに伝えない（React は close を部品の木で親へ伝え、親のダイアログも閉じてしまう）
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <form className="app-dialog-body" onSubmit={(e) => void accept(e)}>
        <h2 className="app-dialog-title">踏み台のサーバーの鍵を確かめる</h2>
        <p className="small">
          「{ssh.host}」には初めてつなぎます。下の指紋が、サーバーの管理者・クラウドの画面で確かめたものと同じなら受け入れてください。受け入れると
          ~/.ssh/known_hosts に足し、次からはターミナルの ssh でも確かめずにつながります。
        </p>
        {scan.loading && <p className="small muted">サーバーの鍵を読んでいます…</p>}
        <ErrorText message={scan.error} />
        {scan.data && (
          <>
            <p className="small muted">known_hosts の名前: {scan.data.host}</p>
            <ul className="db-ssh-key-list">
              {scan.data.keys.map((k) => (
                <li key={k.fingerprint}>
                  <span className="db-ssh-key-type">{k.type}</span>
                  <code>{k.fingerprint}</code>
                </li>
              ))}
            </ul>
          </>
        )}
        <ErrorText message={error} />
        <DialogActions onCancel={() => dialog.close()} submit={{ label: "受け入れてつなぐ", busyLabel: "足しています…", busy, disabled: !scan.data }} />
      </form>
    </dialog>
  );
}
