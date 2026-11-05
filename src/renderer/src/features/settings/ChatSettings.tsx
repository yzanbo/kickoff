import { useSetting } from "@/hooks/useSetting";
import { BUSY_WORKPLACE_ACTION, CHAT_CLOSE_ACTION } from "@/lib/storageKeys";
import { CHAT_CLOSE_ACTION_LABELS, CHAT_CLOSE_ACTIONS, type ChatCloseAction } from "@/features/chat/closeChat";
import { BUSY_WORKPLACE_ACTION_LABELS, BUSY_WORKPLACE_ACTIONS, type BusyWorkplaceAction } from "@/features/worktree/busyWorkplace";
import { CheckField, Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";
import { SaveActions } from "@/ui/SaveActions";
import { useSettingsDraft } from "./useSettingsDraft";
import { AUTO_COMPACT_CHOICES } from "@shared/chat/autoCompact";

/** 自動のアーカイブで選べる日数（null はしない） */
const ARCHIVE_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "しない" },
  { value: 1, label: "1 日" },
  { value: 3, label: "3 日" },
  { value: 7, label: "7 日" },
  { value: 14, label: "14 日" },
  { value: 30, label: "30 日" },
];

/** 設定: チャットの扱い（完了したチャットの自動のアーカイブ・自動圧縮を始める量・通信が切れて止まったときの自動の再開・✕ を押したときの扱い・作業中の作業場所で始めるときの扱い） */
export function ChatSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  // ✕ を押したときの扱い（この Mac の画面の設定なので、選んだらすぐ反映する）
  const [closeAction, setCloseAction] = useSetting(CHAT_CLOSE_ACTION);
  // ほかのチャットが作業中の作業場所へ新しいチャットを送るとき（これもこの Mac の画面の設定なので、選んだらすぐ反映する）
  const [busyAction, setBusyAction] = useSetting(BUSY_WORKPLACE_ACTION);
  if (!draft) return null;
  return (
    <section className="section">
      <h2>チャット</h2>
      <div className="form">
        <Field
          label="完了したチャットを自動でアーカイブ"
          help="終わって既読になったチャットを、最後に動いてからこの日数がたったら、一覧からしまいます。未読・回答待ち・作業中・失敗した・固定したチャットはしまいません。会話の記録は残り、アーカイブ済みから戻せます。"
        >
          <select
            value={draft.auto_archive_days ?? ""}
            onChange={(e) => setDraft({ ...draft, auto_archive_days: e.target.value ? Number(e.target.value) : null })}
          >
            {ARCHIVE_CHOICES.map((c) => (
              <option key={c.label} value={c.value ?? ""}>
                {c.value === null ? c.label : `完了から ${c.label}たったら`}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="自動圧縮を始める量"
          help="コンテキストウィンドウをこの割合まで使ったら、Claude Code が会話を自動で要約してコンテキストを空けます（200k の窓で 50% なら 100k トークン）。早めにすると、長い作業でも上限の手前で慌てて圧縮せずに済みますが、要約の回数は増えます。次に送ったやり取りから効きます。チャット欄の円の外の矢印と、円を押した詳細の棒の縦線が、その位置です。円を押した詳細でも選べます。"
        >
          <select
            value={draft.auto_compact_pct ?? ""}
            onChange={(e) => setDraft({ ...draft, auto_compact_pct: e.target.value ? Number(e.target.value) : null })}
          >
            {[null, ...AUTO_COMPACT_CHOICES].map((pct) => (
              <option key={pct ?? "default"} value={pct ?? ""}>
                {pct === null ? "Claude Code の既定（上限の少し手前）" : `コンテキストの ${pct}% を使ったら`}
              </option>
            ))}
          </select>
        </Field>
        <CheckField
          label="通信が切れて止まったら、つながったときに自動で再開する"
          help="作業中に Wi-Fi が切れるなどして止まったチャットに、つながったら「続けて」を送ります。続けて 3 回止まったら、再開するかをチャットの中で聞きます。止まっている間、送信待ちの指示は送らずに止めておきます。"
          checked={draft.auto_resume_on_reconnect}
          onChange={(on) => setDraft({ ...draft, auto_resume_on_reconnect: on })}
        />
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() =>
          saveFields({ auto_archive_days: draft.auto_archive_days, auto_compact_pct: draft.auto_compact_pct, auto_resume_on_reconnect: draft.auto_resume_on_reconnect })
        }
      />
      <div className="form">
        <Field
          label="チャットの ✕ を押したとき"
          help="チャットのタブの × に効きます（選んだらすぐ反映）。毎回聞くときは、表示だけ消す・アーカイブ・削除から選び、「次からはこれにする」でここを変えられます。削除は取り消せないので、既定にしても毎回確かめます。"
        >
          <Segmented<ChatCloseAction>
            className="segmented theme-switch"
            label="チャットの ✕ を押したとき"
            value={closeAction}
            onChange={setCloseAction}
            options={CHAT_CLOSE_ACTIONS.map((value) => ({ value, label: CHAT_CLOSE_ACTION_LABELS[value] }))}
          />
        </Field>
        <Field
          label="ほかのチャットが作業中の作業場所で、新しいチャットを始めるとき"
          help="同じ作業場所（本体・ワークツリー）でほかのチャットが作業中のときに、新しいチャットを送ったときの扱いです（選んだらすぐ反映）。毎回聞くときは確かめのダイアログを出し、「次からはこれにする」でここを変えられます。新しいワークツリーで始めるときは、ブランチ名を聞いてから作ります。"
        >
          <Segmented<BusyWorkplaceAction>
            className="segmented theme-switch"
            label="ほかのチャットが作業中の作業場所で、新しいチャットを始めるとき"
            value={busyAction}
            onChange={setBusyAction}
            options={BUSY_WORKPLACE_ACTIONS.map((value) => ({ value, label: BUSY_WORKPLACE_ACTION_LABELS[value] }))}
          />
        </Field>
      </div>
    </section>
  );
}
