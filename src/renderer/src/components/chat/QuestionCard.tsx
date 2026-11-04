import { Check, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { Approval, Attachment, Question } from "../../../../core/types";
import { cx } from "../../cx";
import { useSharedChoice } from "../../hooks/useStoredState";
import { QUESTION_LAYOUT_KEY } from "../../storageKeys";
import { ErrorText } from "../ErrorText";
import { Segmented } from "../Segmented";
import { QuestionOtherField, type OtherFiles } from "./QuestionOtherField";
import { useResolve } from "./useResolveApproval";

const OTHER = "__other__";
const SKIP_MESSAGE = "ユーザーはこの質問をスキップしました。推測できる範囲で進めてください。";

/** 質問がいくつもあるときの出し方: 1 問ずつ進める/ すべて並べる */
type QuestionLayout = "steps" | "all";
const LAYOUTS: readonly QuestionLayout[] = ["steps", "all"];

/**
 * AI からの質問（AskUserQuestion）。選択肢と「その他」（複数行・画像などの添付）で答える。
 * 質問が 2 つ以上なら、1 問ずつ（上に質問の見出しを並べて、いまの位置と答えたものを示す。戻る・次へ）と、すべて並べるを切り替えられる（初めは 1 問ずつ）
 */
export function QuestionCard({ approval }: { approval: Approval }) {
  const questions = (approval.input.questions as Question[] | undefined) ?? [];
  const { sending, error, resolve } = useResolve(approval.id);
  const [layout, setLayout] = useSharedChoice<QuestionLayout>(QUESTION_LAYOUT_KEY, LAYOUTS, "steps");
  const stepped = layout === "steps" && questions.length > 1;
  const [step, setStep] = useState(0);
  const current = Math.min(step, questions.length - 1);
  // 質問ごとに選んだラベル（"その他" は OTHER）と自由記述・「その他」に添えた添付
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [otherFiles, setOtherFiles] = useState<Record<string, OtherFiles>>({});

  const answers: Record<string, string | string[]> = {};
  const attachments: Record<string, Attachment[]> = {};
  for (const q of questions) {
    const otherPicked = (selected[q.question] ?? []).includes(OTHER);
    const files = otherPicked ? (otherFiles[q.question]?.attachments ?? []) : [];
    // 「その他」は文を書かずに添付だけでも答えられる
    const otherText = (other[q.question] ?? "").trim() || (files.length > 0 ? "添付のとおりです" : "");
    const picked = (selected[q.question] ?? []).map((l) => (l === OTHER ? otherText : l)).filter(Boolean);
    if (picked.length > 0) answers[q.question] = q.multiSelect ? picked : picked[0];
    if (files.length > 0) attachments[q.question] = files;
  }
  const answered = (q: Question | undefined) => Boolean(q && answers[q.question] !== undefined);
  // アップロードの途中は回答させない（添付が抜け落ちないように）
  const uploading = questions.some((q) => (selected[q.question] ?? []).includes(OTHER) && otherFiles[q.question]?.uploading);
  const complete = questions.every(answered) && !uploading;
  const answer = () => {
    if (!sending && complete) void resolve({ action: "answer", answers, ...(Object.keys(attachments).length > 0 ? { attachments } : {}) });
  };
  const isLast = current >= questions.length - 1;
  const next = () => {
    if (!answered(questions[current])) return;
    if (isLast) answer();
    else setStep(current + 1);
  };

  /** 「その他」を選ぶ（選んでいなければ。1 つ選ぶ質問ではほかの選択を外す） */
  const pickOther = (q: Question) =>
    setSelected((prev) => {
      const before = prev[q.question] ?? [];
      if (before.includes(OTHER)) return prev;
      return { ...prev, [q.question]: q.multiSelect ? [...before, OTHER] : [OTHER] };
    });

  const toggle = (q: Question, label: string, index: number) => {
    const before = selected[q.question] ?? [];
    const after = !q.multiSelect ? [label] : before.includes(label) ? before.filter((l) => l !== label) : [...before, label];
    setSelected((prev) => ({ ...prev, [q.question]: after }));
    // 1 問ずつのとき、1 つ選ぶ質問で選択肢を選んだら次の質問へ（「その他」は書いてから進む）
    if (stepped && !q.multiSelect && label !== OTHER && index < questions.length - 1) setStep(index + 1);
  };

  /** キーの 1〜9 で、いまの質問の選択肢を選ぶ（1 問ずつ・質問が 1 つのとき。文を書いている欄では効かせない） */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("textarea, input[type=text]")) return;
    if (questions.length > 1 && !stepped) return;
    const q = questions[current];
    const option = q?.options[Number(e.key) - 1];
    if (!q || !/^[1-9]$/.test(e.key) || !option) return;
    e.preventDefault();
    toggle(q, option.label, current);
  };
  // たたむと、見出しといまの質問の 1 行だけにする（縦に場所を取らないように。答えた内容は残る）
  const [folded, setFolded] = useState(false);
  return (
    // 押すとカードにピントを置き、キーの 1〜9 で選べるようにする
    <div className={cx("approval-card question-card", !stepped && questions.length > 1 && "all")} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="approval-head">
        <button
          type="button"
          className="question-fold"
          aria-expanded={!folded}
          title={folded ? "質問を開く" : "質問をたたむ（答えた内容は残ります）"}
          onClick={() => setFolded(!folded)}
        >
          {folded ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          <span className="approval-badge question-badge">AI からの質問</span>
          {folded && <span className="question-folded-text">{questions[current]?.question}{questions.length > 1 ? `（${current + 1} / ${questions.length}）` : ""}</span>}
        </button>
        {!folded && questions.length > 1 && (
          <Segmented<QuestionLayout>
            className="segmented question-layout"
            label="質問の出し方"
            value={layout}
            onChange={setLayout}
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
            <button
              key={q.question}
              type="button"
              role="tab"
              aria-selected={i === current}
              className={cx("question-step", i === current && "active", answered(q) && "done")}
              title={q.question}
              onClick={() => setStep(i)}
            >
              {answered(q) ? <Check size={11} aria-hidden /> : <span className="question-step-number">{i + 1}</span>}
              <span className="question-step-label">{q.header || `質問 ${i + 1}`}</span>
            </button>
          ))}
        </div>
      )}
      {/* 1 問ずつ・たたんだときも欄は作り直さずに隠す（「その他」の文・添付を残すため） */}
      {questions.map((q, index) => {
        const picked = selected[q.question] ?? [];
        return (
          <div key={q.question} className="question" role="group" aria-labelledby={`${approval.id}-q${index}`} hidden={folded || (stepped && index !== current)}>
            <div className="question-title" id={`${approval.id}-q${index}`}>
              {!stepped && questions.length > 1 && <span className="question-number">{index + 1}</span>}
              {/* 見出し（短い名前）は質問が 1 つのときだけ。1 問ずつは上の並び、すべては番号で足りる */}
              {questions.length === 1 && q.header && <span className="question-header">{q.header}</span>}
              <span className="question-text">{q.question}</span>
            </div>
            <div className="question-options">
              {q.options.map((o, i) => (
                <label key={o.label} className={cx("question-option", picked.includes(o.label) && "checked")}>
                  {/* 丸の代わりに番号の箱（選ぶと色が付き、複数選ぶ質問ではチェック）。キーの 1〜9 でも選べる */}
                  <input
                    className="question-input"
                    type={q.multiSelect ? "checkbox" : "radio"}
                    name={`${approval.id}:${q.question}`}
                    checked={picked.includes(o.label)}
                    onChange={() => toggle(q, o.label, index)}
                  />
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
                    value={other[q.question] ?? ""}
                    onFocus={() => !picked.includes(OTHER) && toggle(q, OTHER, index)}
                    onChange={(text) => setOther((prev) => ({ ...prev, [q.question]: text }))}
                    onFiles={(files) => {
                    setOtherFiles((prev) => ({ ...prev, [q.question]: files }));
                    // ドラッグで添付したとき（欄に入らずに添付した）も「その他」を選ぶ（選ばないと添付が回答に入らない）
                    if (files.attachments.length > 0 || files.uploading) pickOther(q);
                  }}
                    // 1 問ずつなら次の質問へ（最後なら回答）、すべて並べているなら回答
                    onSubmit={stepped ? next : answer}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="approval-actions" hidden={folded}>
        {stepped && current > 0 && (
          <button className="btn" disabled={sending} onClick={() => setStep(current - 1)}>
            戻る
          </button>
        )}
        {stepped && !isLast ? (
          <button className="btn btn-primary" disabled={sending || !answered(questions[current])} onClick={next}>
            次へ
          </button>
        ) : (
          <button className="btn btn-primary" disabled={sending || !complete} title={uploading ? "添付のアップロードが終わるまでお待ちください" : !complete ? "まだ答えていない質問があります" : undefined} onClick={answer}>
            回答する
          </button>
        )}
        <button className="btn" disabled={sending} onClick={() => void resolve({ action: "deny", message: SKIP_MESSAGE })}>
          スキップ
        </button>
        {stepped && (
          <span className="question-progress muted small">
            {current + 1} / {questions.length}
          </span>
        )}
      </div>
      <ErrorText message={error} />
    </div>
  );
}
