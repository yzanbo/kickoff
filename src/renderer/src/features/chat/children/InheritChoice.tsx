import { MessagesSquare } from "lucide-react";
import { Segmented } from "@/ui/Segmented";

type InheritValue = "inherit" | "fresh";

/** 始め方の名前（切り替え・メニューの項目で同じ言葉にする） */
export const INHERIT_LABELS = { inherit: "会話を引き継ぐ", fresh: "新しく始める" } as const;

/** 選んだ始め方の説明 1 行（parentLabel は親を呼ぶ名前「親のチャット」「このチャット」） */
export function inheritHelp(inherit: boolean, parentLabel: string): string {
  return inherit ? `${parentLabel}の会話の続きとして始めます（「これって？」で通じます）` : `${parentLabel}の会話は渡さず、書いた文だけで始めます`;
}

/**
 * 子チャットを作るときの「会話を引き継ぐ / 新しく始める」の切り替えと、選んだ方の説明 1 行（どちらを選んでも長さが近く、切り替えても行の数が変わりにくいように短くし、詳しくはボタンに乗せたときの説明に）。
 * 新しい子チャットのタブ（入力欄のすぐ上）と「新しい子チャットで聞く」の画面で同じ形にする（チェックだと外したときの意味が分からないため、両方に名前を付ける）。
 * onOpen を渡すと、引き継ぐを選んでいる間だけ右端に「引き継いで開く」（聞くことなしで、会話を引き継いだ子チャットを開くだけ）
 */
export function InheritChoice({ inherit, onChange, parentLabel, onOpen, opening = false }: {
  inherit: boolean;
  onChange: (inherit: boolean) => void;
  /** 説明の文で親を呼ぶ名前（「親のチャット」「このチャット」） */
  parentLabel: string;
  /** 「引き継いで開く」: 聞くことを書かずに、会話を引き継いだ子チャットを開く（引き継ぐを選んでいるときだけ右端に出す。利用者の依頼） */
  onOpen?: () => void;
  /** 開いている途中（ボタンを押せなくする） */
  opening?: boolean;
}) {
  return (
    <div className="inherit-choice">
      <Segmented<InheritValue>
        className="segmented inherit-choice-switch"
        label="子チャットの始め方"
        value={inherit ? "inherit" : "fresh"}
        options={[
          { value: "inherit", label: INHERIT_LABELS.inherit, tip: `会話を引き継ぐ（${parentLabel}のいちばん新しい終わった作業までの会話を引き継ぎます。「これってどういう意味？」がそのまま通じます）` },
          { value: "fresh", label: INHERIT_LABELS.fresh, tip: `新しく始める（${parentLabel}の会話は渡さず、書いた文だけで始めます）` },
        ]}
        onChange={(v) => onChange(v === "inherit")}
      />
      <span className="inherit-choice-help muted small">{inheritHelp(inherit, parentLabel)}</span>
      {onOpen && inherit && (
        <button
          type="button"
          className="btn btn-sm inherit-choice-open"
          disabled={opening}
          data-tip={`聞くことを書かずに、${parentLabel}の会話を引き継いだ子チャットを開きます（聞くことは開いてから書けます）`}
          onClick={onOpen}
        >
          <MessagesSquare size={13} aria-hidden />
          {opening ? "開いています…" : "引き継いで開く"}
        </button>
      )}
    </div>
  );
}
