import { EXTERNAL_TERMINALS, type ExternalTerminalId } from "../../../../core/types";
import { terminalLabel, useExternalTerminal } from "../../externalTerminal";
import { useAsync } from "../../hooks/useAsync";
import { Field } from "../Field";

/** ターミナル: 外部のターミナルとして開くアプリ（チャットの見出し・下のパネルの「外部のターミナルで開く」に効く） */
export function TerminalSettings() {
  const { terminal, setTerminal } = useExternalTerminal();
  // この Mac に入っているもの（選んでいるものは、入っていなくても出す）
  const installed = useAsync(async () => (await window.kickoff?.externalTerminals()) ?? ["terminal"]);
  const choices = EXTERNAL_TERMINALS.filter((t) => t.id === terminal || (installed.data ?? ["terminal"]).includes(t.id));
  return (
    <section className="section">
      <h2>ターミナル</h2>
      <div className="form">
        <Field label="外部のターミナル" help="チャットの見出しと下のパネルの「外部のターミナルで開く」で使うアプリです。この Mac に入っているものから選べます。">
          <select value={terminal} disabled={!window.kickoff} onChange={(e) => setTerminal(e.target.value as ExternalTerminalId)}>
            {choices.map((t) => (
              <option key={t.id} value={t.id}>
                {terminalLabel(t.id)}
                {installed.data && !installed.data.includes(t.id) ? "（見つかりません）" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}
