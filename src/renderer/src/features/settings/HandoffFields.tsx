import { HANDOFF_VIA_SHORT, HANDOFF_VIAS, type HandoffVia } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { HANDOFF_VIA } from "@/lib/storageKeys";
import { Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";

/** 設定の「表示」の「親チャットに追加するとき」（子チャットの作業の終わりの行の「親チャットに追加」を押したときの渡し方。入力欄 / 今すぐ送る / 送信待ち） */
export function HandoffViaField() {
  const [value, setValue] = useSetting(HANDOFF_VIA);
  return (
    <Field
      label="親チャットに追加するとき"
      help="子チャットの作業の終わりの行の「親チャットに追加」を押したときの渡し方です。最後の返答を、そのまま直接の親チャットに渡します。入力欄は親の入力欄の後ろに足して親を見せ（送るのは自分で）、今すぐ送るは親が作業していなければすぐ送り、作業中ならいまの作業に伝えます。送信待ちは親の送信待ちの最後に足します。ボタンの ▾ で、今回だけ別の渡し方を選べます。"
    >
      <Segmented<HandoffVia>
        className="segmented theme-switch"
        label="親チャットに追加するとき"
        value={value}
        onChange={setValue}
        options={HANDOFF_VIAS.map((via) => ({ value: via, label: HANDOFF_VIA_SHORT[via] }))}
      />
    </Field>
  );
}
