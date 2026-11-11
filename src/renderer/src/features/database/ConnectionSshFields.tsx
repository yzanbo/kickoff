import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { CheckField, Field } from "@/ui/Field";
import type { ConnectionForm } from "./connectionForm";

/**
 * 接続のダイアログの「SSH トンネル」: 踏み台（~/.ssh/config の Host かホスト名）・ポート・ユーザー・鍵のファイル・パスワード。
 * この Mac の ssh で踏み台につなぎ、DB のポートを手元に転送する（省いたものは ~/.ssh/config と ssh の既定。ssh-agent も効く）
 */
export function ConnectionSshFields({
  projectId,
  form,
  hasPassword,
  set,
}: {
  projectId: number;
  form: ConnectionForm;
  /** 保存した SSH のパスワードがあるか（編集のときだけ） */
  hasPassword: boolean;
  set: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void;
}) {
  const hosts = useAsync(() => (form.ssh_on ? api.dbSshHosts(projectId) : Promise.resolve([])), [projectId, form.ssh_on]);
  return (
    <>
      <CheckField
        label="SSH トンネルを通す"
        help="踏み台のサーバーに ssh でつなぎ、そこから DB につなぎます（ホストは踏み台から見た DB の場所）。この Mac の ssh・~/.ssh/config・ssh-agent をそのまま使います"
        checked={form.ssh_on}
        onChange={(v) => set("ssh_on", v)}
      />
      {form.ssh_on && (
        <div className="db-ssh-fields">
          <div className="db-connection-row">
            <Field label="踏み台" help="~/.ssh/config の Host の名前か、ホスト名">
              <input value={form.ssh_host} onChange={(e) => set("ssh_host", e.target.value)} required list="db-ssh-hosts" placeholder="bastion" spellCheck={false} />
            </Field>
            <Field label="ポート">
              <input value={form.ssh_port} onChange={(e) => set("ssh_port", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="22" />
            </Field>
          </div>
          <datalist id="db-ssh-hosts">
            {(hosts.data ?? []).map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
          <div className="db-connection-row">
            <Field label="ユーザー（任意）">
              <input value={form.ssh_user} onChange={(e) => set("ssh_user", e.target.value)} spellCheck={false} autoComplete="off" placeholder="ec2-user" />
            </Field>
            <Field label="鍵のファイル（任意）">
              <input value={form.ssh_identity_file} onChange={(e) => set("ssh_identity_file", e.target.value)} spellCheck={false} placeholder="~/.ssh/id_ed25519" />
            </Field>
          </div>
          <Field
            label="SSH のパスワード（任意）"
            help={hasPassword ? "保存してあります（変えるときだけ入力）" : "鍵でログインできないときだけ。この Mac の Kickoff の中だけに保存し、画面・AI には出しません"}
          >
            <input
              type="password"
              value={form.ssh_password}
              onChange={(e) => set("ssh_password", e.target.value)}
              disabled={form.clearSshPassword}
              autoComplete="new-password"
              placeholder={hasPassword ? "••••••••" : ""}
            />
          </Field>
          {hasPassword && <CheckField label="保存した SSH のパスワードを消す" checked={form.clearSshPassword} onChange={(v) => set("clearSshPassword", v)} />}
        </div>
      )}
    </>
  );
}
