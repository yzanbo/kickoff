import { HANDOFF_VIA_SHORT, HANDOFF_VIAS, type HandoffVia } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { HANDOFF_AFTER, HANDOFF_VIA } from "@/lib/storageKeys";
import { HANDOFF_AFTER_LABELS, HANDOFF_AFTERS, type HandoffAfter } from "@shared/chat/handoff";
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

/** 設定の「表示」の「親チャットに追加したあと」（渡したあとの子チャット。そのまま / アーカイブ / 削除） */
export function HandoffAfterField() {
  const [value, setValue] = useSetting(HANDOFF_AFTER);
  return (
    <Field
      label="親チャットに追加したあと"
      help="「親チャットに追加」で渡せたあとの子チャットの扱いです。アーカイブ・削除は、確かめてから行います（子チャットが作業中ならしません）。削除は今すぐ送る・送信待ちで渡したときだけで、入力欄に入れたときはアーカイブにします（送る前に依頼文が消えないように）。削除すると、その子チャットの孫チャットも一緒に消えます。ボタンの ▾ で、今回だけ別の扱いを選べます。"
    >
      <Segmented<HandoffAfter>
        className="segmented theme-switch"
        label="親チャットに追加したあと"
        value={value}
        onChange={setValue}
        options={HANDOFF_AFTERS.map((after) => ({ value: after, label: HANDOFF_AFTER_LABELS[after] }))}
      />
    </Field>
  );
}
