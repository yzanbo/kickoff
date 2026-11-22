// サブエージェントが設定の「表示」に出す欄
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { chatSettings } from "@/features/chat/ui";

/** サブエージェントを開く場所 */
export function SubagentOpenField() {
  const [subagentOpenIn, setSubagentOpenIn] = useSetting(chatSettings.subagentOpenIn);
  return (
    <Field as="div"
      label="サブエージェントを開く場所"
      help="サブエージェントのカードの見出し・動きの行・「サブエージェント N 件」の一覧・裏の作業の一覧を押したときの開き方です。流れの中は、チャットの流れの中でカードを開きます。右の欄は、チャットの画面の右に、チャットと同じような画面で開きます（右の欄の中で上下・左右に分けて並べられ、幅はつまみのドラッグで変えられます）。別ウィンドウは、サブエージェントごとに新しいウィンドウで開きます。ほかの開き方は、一覧の行のボタンやカードのボタンでいつでも選べます。「サブエージェント N 件」の一覧の上でも変えられます。"
    >
      <Segmented<"inline" | "side" | "window">
        label="サブエージェントを開く場所"
        value={subagentOpenIn}
        onChange={setSubagentOpenIn}
        options={[
          { value: "inline", label: "流れの中" },
          { value: "side", label: "右の欄" },
          { value: "window", label: "別ウィンドウ" },
        ]}
      />
    </Field>
  );
}
