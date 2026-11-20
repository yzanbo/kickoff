import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { CHILD_CHAT_OPEN_ON_CREATE } from "@/foundation/ui/storage/storageKeys";
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";

/** 設定の「表示」の「子チャットを作ったとき」（右の欄で開く / 別ウィンドウで開く / 開かない） */
export function ChildChatCreateField() {
  const [value, setValue] = useSetting(CHILD_CHAT_OPEN_ON_CREATE);
  return (
    <Field
      label="子チャットを作ったとき"
      help="チャット欄の送信ボタンの右クリックの「新規の子チャットに送る」、会話の右クリックの「新しい子チャットで聞く」、送信待ちの「子チャットで開く / 移す」で子チャットを作ったときの開き方です。開かないにすると、画面はそのままで、入力欄の上の「子チャット n 件」の札が光って知らせます。"
    >
      <Segmented<"side" | "window" | "none">
        label="子チャットを作ったとき"
        value={value}
        onChange={setValue}
        options={[
          { value: "side", label: "右の欄で開く" },
          { value: "window", label: "別ウィンドウで開く" },
          { value: "none", label: "開かない" },
        ]}
      />
    </Field>
  );
}
