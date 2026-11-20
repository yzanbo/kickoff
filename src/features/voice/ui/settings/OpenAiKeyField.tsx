import { useState, type ReactNode } from "react";
import { api } from "@/foundation/ui/api";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { voiceStatusStore } from "@/features/voice/ui/stores/voice";
import { Field } from "@/foundation/ui/kit/Field";
import { ResultMessage } from "@/foundation/ui/kit/SaveActions";

/**
 * OpenAI の API キー（音声入力）。保存したキーは二度と表示せず「保存済み」とだけ出す。
 * 入れ直せば置き換え、「消す」で消す。ほかの設定とは別に、その場で保存する。
 * label を渡せば名前を差し替える（null なら名前の行を出さない。手順の見出しが名前を兼ねるとき）
 */
export function OpenAiKeyField({ saved, label }: { saved: boolean | undefined; label?: ReactNode }) {
  const [key, setKey] = useState("");
  const save = useAction<"save">();
  const store = (value: string) =>
    save.run("save", async () => {
      await api.saveOpenAiKey(value);
      setKey("");
      await voiceStatusStore.reload();
    }, { done: "保存しました" });
  return (
    <Field
      as="div"
      label={label === undefined ? <>OpenAI の API キー {saved && <span className="badge">保存済み</span>}</> : label}
      help="キーはこの Mac の Kickoff の中だけに保存し、画面には二度と表示しません。"
    >
      <div className="input-row">
        <input
          type="password"
          value={key}
          autoComplete="off"
          aria-label="OpenAI の API キー"
          placeholder={saved ? "置き換えるときだけ入れる" : "sk-…"}
          onChange={(e) => setKey(e.target.value)}
        />
        <button type="button" className="btn" disabled={!key.trim() || save.busy !== null} onClick={() => void store(key)}>
          {save.busy !== null ? "保存中…" : "キーを保存"}
        </button>
        {saved && (
          <button type="button" className="btn btn-danger-text" disabled={save.busy !== null} onClick={() => void store("")}>
            消す
          </button>
        )}
      </div>
      <ResultMessage result={save.result} />
    </Field>
  );
}
