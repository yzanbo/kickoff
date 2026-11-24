import type { ExternalTerminalId } from "@shared/foundation/ipc";
import { useExternalTerminal } from "@/foundation/ui/external/externalApps";
import { Field } from "@/foundation/ui/kit/Field";
import { isDesktopApp } from "@/features/terminal/ui/native";

/** ターミナル: 外部のターミナルとして開くアプリ（パネルのターミナルの ▾・下のパネルの「外部のターミナルで開く」に効く） */
export function TerminalSettings() {
  // この Mac に入っているもの（選んでいるものは、入っていなくても出す）
  const { terminal, setTerminal, choices } = useExternalTerminal();
  return (
    <section className="section">
      <h2>ターミナル</h2>
      <div className="form">
        <Field label="外部のターミナル" help="パネルのターミナルの ▾ と、下のパネルの「外部のターミナルで開く」で使うアプリです。この Mac に入っているものから選べます（パネルの ▾ からも選べます）。">
          <select value={terminal} disabled={!isDesktopApp()} onChange={(e) => setTerminal(e.target.value as ExternalTerminalId)}>
            {choices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.missing ? "（見つかりません）" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}
