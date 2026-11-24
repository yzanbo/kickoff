import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "./storage";
import { SwitchField } from "@/foundation/ui/kit/ChoiceField";

/**
 * 定型文の帯を表示するか（設定の「定型文」のいちばん上と「表示」に置く。どのチャットでも同じ値で、
 * チャットの見出しの右クリックの「チャット画面表示」→「定型文の帯」・帯の右クリックの「定型文の帯を隠す」と同じ設定）
 */
export function SnippetBarField() {
  const [hidden, setHidden] = useSetting(storage.settings.barHidden);
  return (
    <SwitchField
      label="定型文の帯"
      help="チャット欄の枠の中のいちばん上に、このプロジェクトで使う定型文を横に並べます。表示しなくても、定型文は設定の「定型文」で足す・直すことができます。タブの列の「表示」と、帯の右クリックでも切り替えられます。"
      checked={!hidden}
      onChange={(on) => setHidden(!on)}
      onLabel="表示する"
      offLabel="表示しない"
    />
  );
}
