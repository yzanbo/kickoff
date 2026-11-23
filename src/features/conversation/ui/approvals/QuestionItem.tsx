import "./QuestionItem.css";
import { Check, Pencil } from "lucide-react";
import { hasPreviews } from "@shared/chat/questionPreviews";
import type { Question } from "@shared/chat/approvalTypes";
import { cx } from "@/foundation/ui/lib/cx";
import { OTHER, shownPreview } from "./questionAnswers";
import type { QuestionEntry, QuestionFormAction } from "./questionForm";
import { QuestionOtherField } from "./QuestionOtherField";

/**
 * 質問のカードの 1 問: 見出し・選択肢（番号の箱。キーの 1〜9 でも選べる）・「その他」の欄・選択肢の図。
 * 選択肢に図（preview）があれば、選択肢の右（狭ければ下）に、乗せた・ピントのある選択肢、なければ選んだ選択肢、どちらもなければ図のある最初の選択肢の図を出す
 */
export function QuestionItem({ q, index, count, idPrefix, stepped, hidden, entry, dispatch, onSubmit }: {
  q: Question;
  index: number;
  count: number;
  idPrefix: string;
  stepped: boolean;
  hidden: boolean;
  entry: QuestionEntry | undefined;
  dispatch: (action: QuestionFormAction) => void;
  /** 「その他」の欄の Enter（1 問ずつなら次の質問へ、すべて並べているなら回答） */
  onSubmit: () => void;
}) {
  const picked = entry?.selected ?? [];
  const withPreview = hasPreviews(q);
  const shown = withPreview ? shownPreview(q, entry?.peek ?? null, picked) : null;
  const look = (label: string | null) => dispatch({ type: "peek", index, label });
  const toggle = (label: string) => dispatch({ type: "toggle", index, label });
  return (
    <div
      className="question"
      role="group"
      aria-labelledby={`${idPrefix}-q${index}`}
      hidden={hidden}
      // 選ばずに右クリックしたときに、質問と選択肢を丸ごと「チャットに追加」・コピーできるようにする（useQuoteMenu）
      data-quote-text={questionQuoteText(q)}
      data-quote-noun="質問"
    >
      <div className="question-title" id={`${idPrefix}-q${index}`}>
        {!stepped && count > 1 && <span className="question-number">{index + 1}</span>}
        {/* 見出し（短い名前）は質問が 1 つのときだけ。1 問ずつは上の並び、すべては番号で足りる */}
        {count === 1 && q.header && <span className="question-header">{q.header}</span>}
        <span className="question-text">{q.question}</span>
      </div>
      <div className={cx("question-body", withPreview && "with-preview")}>
      <div className="question-options" onMouseLeave={() => look(null)}>
        {q.options.map((o, i) => (
          <label
            key={o.label}
            className={cx("question-option", picked.includes(o.label) && "checked", shown?.label === o.label && "previewing")}
            onMouseEnter={() => look(o.label)}
            onFocus={() => look(o.label)}
          >
            {/* 丸の代わりに番号の箱（選ぶと色が付き、複数選ぶ質問ではチェック）。キーの 1〜9 でも選べる */}
            <input className="question-input" type={q.multiSelect ? "checkbox" : "radio"} name={`${idPrefix}:${q.question}`} checked={picked.includes(o.label)} onChange={() => toggle(o.label)} />
            <span className="question-key" aria-hidden>
              {q.multiSelect && picked.includes(o.label) ? <Check size={13} /> : i + 1}
            </span>
            <span>
              <span className="question-label">{o.label}</span>
              <span className="question-description muted small">{o.description}</span>
            </span>
          </label>
        ))}
        {/* その他: 鉛筆の印と「その他の回答」の欄だけの行（書き始めると「その他」を選ぶ） */}
        <div
          className={cx("question-option question-other-row", picked.includes(OTHER) && "checked")}
          // 行のどこを押しても欄に入る（印・余白も）
          onClick={(e) => (e.target as HTMLElement).closest("button") || e.currentTarget.querySelector("textarea")?.focus()}
        >
          <span className="question-other-icon" aria-hidden>
            <Pencil size={13} />
          </span>
          <QuestionOtherField
            value={entry?.other ?? ""}
            onFocus={() => !picked.includes(OTHER) && toggle(OTHER)}
            onChange={(text) => dispatch({ type: "other", index, text })}
            onFiles={(files) => dispatch({ type: "files", index, files })}
            onSubmit={onSubmit}
          />
        </div>
      </div>
      {shown && (
        // 選択肢の図（等幅の文字のまま。罫線の図・コードの見本が多いため）
        <figure className="question-preview card">
          <figcaption className="question-preview-label">{shown.label}</figcaption>
          <pre className="question-preview-body">{shown.preview}</pre>
        </figure>
      )}
      </div>
    </div>
  );
}

/** 質問の丸ごとの文（質問と、番号付きの選択肢と説明）。右クリックの「質問をチャットに追加」「質問全体をコピー」に使う */
function questionQuoteText(q: Question): string {
  const options = q.options.map((o, i) => `${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`);
  return [q.question, ...options].join("\n");
}
