import { DB_PREP_PLACEHOLDERS, DB_PREP_PLACEHOLDER_LABELS, usesMyIp } from "@shared/database/dbPrep";
import { DB_MY_IP_URL } from "@shared/types";
import { CheckField, Field } from "@/ui/Field";
import type { ConnectionForm } from "./connectionForm";

/**
 * 接続のダイアログの「つなぐ前の準備」: 準備・後片付けのコマンド（1 行に 1 つ）・ポートを転送するコマンド・パスワードを取るコマンドと、
 * 中で使える {名前}。コマンドはこの Mac のログインシェルで流れるので、初めて・中身を変えたあとは流す前に中身を確かめさせる（DbPrepDialog）
 */
export function ConnectionPrepFields({ form, set }: { form: ConnectionForm; set: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void }) {
  const sqlite = form.engine === "sqlite";
  const myIp = usesMyIp([form.prep_prepare, form.prep_cleanup, form.prep_tunnel, form.prep_password]);
  return (
    <>
      <CheckField
        label="つなぐ前にコマンドを流す"
        help="SSO のログイン・IP の許可・DB の起動・トンネル・一時のパスワードなど、つなぐ前の手順をコマンドにしておけます。この Mac のログインシェルで、あなたの権限で流れます"
        checked={form.prep_on}
        onChange={(v) => set("prep_on", v)}
      />
      {form.prep_on && (
        <div className="db-prep-fields">
          <Field label="準備のコマンド（1 行に 1 つ）" help="接続の右クリックの「準備のコマンドを流す…」で上から順に流します。1 つが失敗したらそこで止めます">
            <textarea value={form.prep_prepare} onChange={(e) => set("prep_prepare", e.target.value)} rows={3} spellCheck={false} placeholder="aws sso login --profile staging" />
          </Field>
          <Field label="後片付けのコマンド（1 行に 1 つ）" help="準備が済んだ接続を切るとき（しばらく使わなかった・接続を消した・アプリを止めた）に流します。準備で開けたもの（IP の許可など）を閉じます">
            <textarea
              value={form.prep_cleanup}
              onChange={(e) => set("prep_cleanup", e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="aws ec2 revoke-security-group-ingress --group-id sg-… --cidr {my_ip}/32 --protocol tcp --port 5432"
            />
          </Field>
          {!sqlite && (
            <>
              <Field
                label="ポートを転送するコマンド（任意）"
                help={
                  form.ssh_on
                    ? "SSH トンネルと一緒には使えません"
                    : "つなぐときに流しっぱなしにし、{local_port} につながるまで待ちます（使い終わったら止めます）。ホストとポートの代わりに、このポートにつなぎます"
                }
              >
                <input
                  value={form.prep_tunnel}
                  onChange={(e) => set("prep_tunnel", e.target.value)}
                  disabled={form.ssh_on}
                  spellCheck={false}
                  placeholder="aws ssm start-session --target i-… --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host={host},portNumber={port},localPortNumber={local_port}"
                />
              </Field>
              <Field label="パスワードを取るコマンド（任意）" help="つなぐたびに流し、出力をパスワードにします（保存したパスワードの代わり）。出力は保存も表示もしません">
                <input
                  value={form.prep_password}
                  onChange={(e) => set("prep_password", e.target.value)}
                  spellCheck={false}
                  placeholder="aws rds generate-db-auth-token --hostname {host} --port {port} --username {user}"
                />
              </Field>
            </>
          )}
          {myIp && (
            <Field label="{my_ip} の問い合わせ先" help="いまの IP を、ここに聞いて入れます（使うときだけ）">
              <input value={form.prep_my_ip_url} onChange={(e) => set("prep_my_ip_url", e.target.value)} spellCheck={false} placeholder={DB_MY_IP_URL} />
            </Field>
          )}
          <dl className="db-prep-placeholders small">
            {DB_PREP_PLACEHOLDERS.map((name) => (
              <div key={name}>
                <dt>{`{${name}}`}</dt>
                <dd>{DB_PREP_PLACEHOLDER_LABELS[name]}</dd>
              </div>
            ))}
          </dl>
          <p className="small muted">値はシェルの 1 語として入れます。初めて流す前と中身を変えたあとは、流す前にコマンドを見せて確かめてもらいます。</p>
        </div>
      )}
      <div className="db-connection-row">
        <Field label="次に確かめる日（任意）" help="パスワードのローテーション・許可の期限など。その日から木の接続に印を出します">
          <input type="date" value={form.check_on} onChange={(e) => set("check_on", e.target.value)} />
        </Field>
        <Field label="ひとこと">
          <input value={form.check_note} onChange={(e) => set("check_note", e.target.value)} maxLength={200} placeholder="パスワードを替える" />
        </Field>
      </div>
    </>
  );
}
