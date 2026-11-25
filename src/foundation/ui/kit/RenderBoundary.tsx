import "./RenderBoundary.css";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** 投げたときに代わりに出すもの */
  fallback: ReactNode;
  /** この値が変わったら、もう一度描いてみる（書いている途中の返答は文が伸びるたびに試し直す） */
  resetKey: unknown;
  children: ReactNode;
}

interface State {
  failed: boolean;
  /** いま描いている resetKey（変わったら試し直す） */
  key: unknown;
}

/**
 * 描く処理が投げたら、その中だけを fallback に替える（画面ごと落とさない）。React の ErrorBoundary は class の部品でしか作れない。
 * 包む単位はメッセージ 1 つなど（開くたびに同じものを描くので、投げたままにすると、その画面ごと開けなくなる）
 */
export class RenderBoundary extends Component<Props, State> {
  override state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // 中身が変わったら、もう一度描いてみる
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("描く処理が失敗しました", error, info.componentStack);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 文を描けなかったときの代わり（そのメッセージだけ「表示できませんでした」と、元の文を書いたまま出す） */
export function RenderFailed({ text }: { text: string }) {
  return (
    <div className="render-failed" role="alert">
      <p className="render-failed-title">表示できませんでした</p>
      <pre className="render-failed-text">{text}</pre>
    </div>
  );
}
