import { useState } from "react";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { voiceStatusStore } from "@/stores/voice";
import { Field } from "@/ui/Field";
import { ResultMessage } from "@/ui/SaveActions";

/**
 * OpenAI の API キー（音声入力）。保存したキーは二度と表示せず「保存済み」とだけ出す。
 * 入れ直せば置き換え、「消す」で消す。ほかの設定とは別に、その場で保存する
 */
export function OpenAiKeyField({ saved }: { saved: boolean | undefined }) {
  const [key, setKey] = useState("");
  const save = useSave();
  const store = (value: string) =>
    save.run(async () => {
      await api.saveOpenAiKey(value);
      setKey("");
      await voiceStatusStore.reload();
    });
  return (
    <Field
      as="div"
      label={<>OpenAI の API キー {saved && <span className="badge">保存済み</span>}</>}
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
        <button type="button" className="btn" disabled={!key.trim() || save.saving} onClick={() => void store(key)}>
          {save.saving ? "保存中…" : "キーを保存"}
        </button>
        {saved && (
          <button type="button" className="btn btn-danger-text" disabled={save.saving} onClick={() => void store("")}>
            消す
          </button>
        )}
      </div>
      <ResultMessage result={save.message} />
    </Field>
  );
}
