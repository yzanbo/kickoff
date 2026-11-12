import { DB_ENGINE_LABELS, DB_ENGINES, DB_SSL_MODE_LABELS, type DbEngine, type DbSslMode } from "@shared/types";
import { cx } from "@/lib/cx";
import { CheckField, Field } from "@/ui/Field";
import type { ConnectionForm } from "./connectionForm";
import { ENGINE_MARKS } from "./dbFormat";

/** 種類のタイルに添える一言 */
const ENGINE_NOTES: Record<DbEngine, string> = { sqlite: "手元のファイル", postgres: "サーバー", mysql: "サーバー" };

/** 接続のダイアログの「DB の種類」: 種類をタイルで選ぶ（印・名前・一言。radiogroup） */
export function EngineTiles({ value, onChange }: { value: DbEngine; onChange: (engine: DbEngine) => void }) {
  return (
    <div className="db-engine-tiles" role="radiogroup" aria-label="DB の種類">
      {DB_ENGINES.map((e) => (
        <button key={e} type="button" role="radio" aria-checked={value === e} className={cx("db-engine-tile", value === e && "active")} onClick={() => onChange(e)}>
          <span className="db-engine-mark" aria-hidden>
            {ENGINE_MARKS[e]}
          </span>
          <span className="db-engine-tile-name">{DB_ENGINE_LABELS[e]}</span>
          <span className="db-engine-tile-note small muted">{ENGINE_NOTES[e]}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 接続のダイアログの「SSL」: SSH トンネルと同じく、チェックを入れたときだけ欄を開く（確かめ方・CA の証明書）。
 * チェックを入れると「暗号化する（証明書は確かめない）」から
 */
export function ConnectionSslFields({ form, set }: { form: ConnectionForm; set: <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => void }) {
  const on = form.ssl !== "off";
  return (
    <>
      <CheckField label="SSL で暗号化する" help="DB とのやり取りを暗号化します。外のサーバー（クラウドの DB など）では入れておくと安全です" checked={on} onChange={(v) => set("ssl", v ? "require" : "off")} />
      {on && (
        <div className="db-ssh-fields">
          <Field label="確かめ方">
            <select value={form.ssl} onChange={(e) => set("ssl", e.target.value as DbSslMode)}>
              {(["require", "verify"] as const).map((m) => (
                <option key={m} value={m}>
                  {DB_SSL_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          {form.ssl === "verify" && (
            <Field label="CA の証明書（省けば OS の証明書で確かめます）">
              <input value={form.ca_path} onChange={(e) => set("ca_path", e.target.value)} placeholder="~/certs/ca.pem" spellCheck={false} />
            </Field>
          )}
        </div>
      )}
    </>
  );
}
