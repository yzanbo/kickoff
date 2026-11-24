import { dbApi } from "@/features/database/ui/api";
import { useQuery } from "@/foundation/ui/query";
import { CheckField, Field } from "@/foundation/ui/kit/Field";
import type { SetPart, SshForm } from "./connectionForm";
import { SecretField } from "./SecretField";

/**
 * 接続のダイアログの「SSH トンネル」: 踏み台（~/.ssh/config の Host かホスト名）・ポート・ユーザー・鍵のファイル・パスワード。
 * この Mac の ssh で踏み台につなぎ、DB のポートを手元に転送する（省いたものは ~/.ssh/config と ssh の既定。ssh-agent も効く）
 */
export function ConnectionSshFields({
  projectId,
  ssh,
  hasPassword,
  set,
}: {
  projectId: number;
  ssh: SshForm;
  /** 保存した SSH のパスワードがあるか（編集のときだけ） */
  hasPassword: boolean;
  set: SetPart<SshForm>;
}) {
  const hosts = useQuery(["ConnectionSshFields.hosts", projectId, ssh.on], () => (ssh.on ? dbApi("GET /api/projects/:projectId/db-connections/ssh-hosts", { params: { projectId } }) : Promise.resolve([])), { keepPrevious: true });
  return (
    <>
      <CheckField
        label="SSH トンネルを通す"
        help="踏み台のサーバーに ssh でつなぎ、そこから DB につなぎます（ホストは踏み台から見た DB の場所）。この Mac の ssh・~/.ssh/config・ssh-agent をそのまま使います"
        checked={ssh.on}
        onChange={(v) => set("on", v)}
      />
      {ssh.on && (
        <div className="db-ssh-fields">
          <div className="db-connection-row">
            <Field label="踏み台" help="~/.ssh/config の Host の名前か、ホスト名">
              <input value={ssh.host} onChange={(e) => set("host", e.target.value)} required list="db-ssh-hosts" placeholder="bastion" spellCheck={false} />
            </Field>
            <Field label="ポート">
              <input value={ssh.port} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="22" />
            </Field>
          </div>
          <datalist id="db-ssh-hosts">
            {(hosts.data ?? []).map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
          <div className="db-connection-row">
            <Field label="ユーザー（任意）">
              <input value={ssh.user} onChange={(e) => set("user", e.target.value)} spellCheck={false} autoComplete="off" placeholder="ec2-user" />
            </Field>
            <Field label="鍵のファイル（任意）">
              <input value={ssh.identity_file} onChange={(e) => set("identity_file", e.target.value)} spellCheck={false} placeholder="~/.ssh/id_ed25519" />
            </Field>
          </div>
          <SecretField
            label="SSH のパスワード（任意）"
            help={hasPassword ? "保存してあります（変えるときだけ入力）" : "鍵でログインできないときだけ。この Mac の Kickoff の中だけに保存し、画面・AI には出しません"}
            saved={hasPassword}
            value={ssh.password}
            clear={ssh.clearPassword}
            clearLabel="保存した SSH のパスワードを消す"
            onChange={(v) => set("password", v)}
            onClear={(v) => set("clearPassword", v)}
          />
        </div>
      )}
    </>
  );
}
