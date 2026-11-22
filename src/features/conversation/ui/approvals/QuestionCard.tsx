import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { Approval } from "@shared/chat/approvalTypes";
import { cx } from "@/foundation/ui/lib/cx";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { QuestionItem } from "./QuestionItem";
import { useQuestionForm } from "./useQuestionForm";

/**
 * AI からの質問（AskUserQuestion）の枠。選択肢と「その他」（複数行・画像などの添付）で答える（1 問は QuestionItem、状態は useQuestionForm）。
 * 質問が 2 つ以上なら、1 問ずつ（上に質問の見出しを並べて、いまの位置と答えたものを示す。戻る・次へ）と、すべて並べるを切り替えられる（初めは 1 問ずつ）
 */
export function QuestionCard({ approval }: { approval: Approval }) {
  const f = useQuestionForm(approval);
  const { questions, form, current, stepped } = f;
  const { folded } = form;
  return (
    // 押すとカードにピントを置き、キーの 1〜9 で選べるようにする
    <div className={cx("approval-card card question-card", !stepped && questions.length > 1 && "all")} tabIndex={-1} onKeyDown={f.onKeyDown}>
      <div className="approval-head">
        {/* たたむと、見出しといまの質問の 1 行だけにする（縦に場所を取らないように。答えた内容は残る） */}
        <button type="button" className="question-fold" aria-expanded={!folded} title={folded ? "質問を開く" : "質問をたたむ（答えた内容は残ります）"} onClick={() => f.dispatch({ type: "fold", folded: !folded })}>
          {folded ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          <span className="approval-badge tag question-badge" data-look="solid">AI からの質問</span>
          {folded && <span className="question-folded-text">{questions[current]?.question}{questions.length > 1 ? `（${current + 1} / ${questions.length}）` : ""}</span>}
        </button>
        {!folded && questions.length > 1 && (
          <Segmented
            size="sm"
            className="question-layout"
            label="質問の出し方"
            value={f.layout}
            onChange={f.setLayout}
            options={[
              { value: "steps", label: "1 問ずつ" },
              { value: "all", label: "すべて" },
            ]}
          />
        )}
      </div>
      {/* 1 問ずつのときは、質問の見出しを並べて、いまの位置と答えたものを示す（押すとその質問へ） */}
      {!folded && stepped && (
        <div className="question-steps" role="tablist" aria-label="質問">
          {questions.map((q, i) => (
            <button key={q.question} type="button" role="tab" aria-selected={i === current} className={cx("question-step pill", i === current && "active", f.answered[i] && "done")} title={q.question} onClick={() => f.dispatch({ type: "step", index: i })}>
              {f.answered[i] ? <Check size={11} aria-hidden /> : <span className="question-step-number">{i + 1}</span>}
              <span className="question-step-label">{q.header || `質問 ${i + 1}`}</span>
            </button>
          ))}
        </div>
      )}
      {/* 1 問ずつ・たたんだときも欄は作り直さずに隠す（「その他」の文・添付を残すため） */}
      {questions.map((q, index) => (
        <QuestionItem
          key={q.question}
          q={q}
          index={index}
          count={questions.length}
          idPrefix={approval.id}
          stepped={stepped}
          hidden={folded || (stepped && index !== current)}
          entry={form.entries[index]}
          dispatch={f.dispatch}
          onSubmit={stepped ? f.next : f.answer}
        />
      ))}
      {/* ボタンの並び: 戻るは左端、右に進み具合・スキップ・次へ / 回答する（主ボタンを右端に置き、スキップはそのすぐ左） */}
      <div className="approval-actions question-actions" hidden={folded}>
        {stepped && current > 0 && (
          <button className="btn" disabled={f.sending} onClick={() => f.dispatch({ type: "step", index: current - 1 })}>
            戻る
          </button>
        )}
        {stepped && (
          <span className="question-progress muted small">
            {current + 1} / {questions.length}
          </span>
        )}
        <button className="btn" disabled={f.sending} onClick={f.skip}>
          スキップ
        </button>
        {stepped && !f.isLast ? (
          <button className="btn btn-primary" disabled={f.sending || !f.answered[current]} onClick={f.next}>
            次へ
          </button>
        ) : (
          <button className="btn btn-primary" disabled={f.sending || !f.complete} title={f.uploading ? "添付のアップロードが終わるまでお待ちください" : !f.complete ? "まだ答えていない質問があります" : undefined} onClick={f.answer}>
            回答する
          </button>
        )}
      </div>
      <ErrorText message={f.error} />
    </div>
  );
}
