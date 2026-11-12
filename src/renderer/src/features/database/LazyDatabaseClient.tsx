// DB クライアントを、開いたときに読む形で出す（DB の画面・SQL の色付け（@codemirror/lang-sql）を起動のときに読み込まない。仕様の「起動を遅くしない」）
import { lazy, Suspense, type ComponentProps } from "react";

const DatabaseClient = lazy(() => import("./DatabaseClient").then((m) => ({ default: m.DatabaseClient })));

/** DatabaseClient と同じ props（中身を読み込むまでは「読み込み中…」） */
export function LazyDatabaseClient(props: ComponentProps<typeof DatabaseClient>) {
  return (
    <Suspense fallback={<div className="page muted">読み込み中…</div>}>
      <DatabaseClient {...props} />
    </Suspense>
  );
}
