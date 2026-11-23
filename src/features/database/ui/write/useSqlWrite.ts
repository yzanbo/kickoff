import { useCallback, useEffect, useRef, useState } from "react";
import { writeConfirmation, type SqlStatement } from "@shared/database/sqlStatements";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import { alert, confirm, prompt } from "@/foundation/ui/kit/ask";

/** 「書き込む」を何もしないまま放っておいたら、読み取り専用に戻すまでの時間 */
const SQL_WRITE_IDLE_MS = 10 * 60_000;

/** 流す前の確かめに見せる SQL の長さ（長い文は頭だけ） */
const PREVIEW_CHARS = 1200;

/** 確かめのダイアログに見せる SQL（長ければ頭だけ。テーブルの保存の確かめでも使う） */
export const clipSql = (text: string) => (text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…（${text.length.toLocaleString()} 文字）` : text);

/** 流す前の確かめに見せる SQL（文ごとに番号を付け、長ければ頭だけ） */
const previewOf = (statements: SqlStatement[]) => clipSql(statements.map((s, i) => `${statements.length > 1 ? `${i + 1}. ` : ""}${s.text}`).join("\n\n"));

/**
 * 環境の名前を打たせて確かめる（書き込む前の確かめが「環境の名前を打たないと流せない」の接続。打ったものが違えば流さない）。
 * テーブルの変更の保存でも使う
 */
export async function confirmByEnvName(connection: DbConnection, title: string, message: string, confirmLabel: string, kept = "流していません。"): Promise<boolean> {
  const env = DB_ENVIRONMENT_LABELS[connection.environment];
  const typed = await prompt({ title, message, label: `確かめのため、環境の名前「${env}」を入れてください`, placeholder: env, confirmLabel }).then((r) => r?.value ?? null);
  if (typed === null) return false;
  if (typed === env) return true;
  await alert("環境の名前が違います", `「${env}」と入れてください。${kept}`);
  return false;
}

/**
 * SQL のタブの「書き込む」（読み取り専用の接続で、このタブだけ読み取り専用を外す）。
 * 始めるときに環境の名前を打たせ、外している間は流すたびに SQL を見せて確かめる。
 * 10 分何もしなければ（流す・打つがなければ）戻す（トランザクションの途中なら、コミットか取り消しのあとに戻す。コミット・取り消しは何かしたに数えない）。タブを閉じる・読み込み直すと戻る（覚えない）。接続の設定は変えない
 */
export function useSqlWrite(connection: DbConnection, pending: boolean) {
  const [on, setOn] = useState(false);
  const [expired, setExpired] = useState(false);
  const [activity, setActivity] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const env = DB_ENVIRONMENT_LABELS[connection.environment];

  // 何かするたびに 10 分を数え直す
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!on) return;
    timer.current = window.setTimeout(() => setExpired(true), SQL_WRITE_IDLE_MS);
    return () => window.clearTimeout(timer.current);
  }, [on, activity]);

  // 時間が来たら戻す（トランザクションの途中なら、終わるまで待つ。読み取り専用に戻すと、DB 側の接続をつなぎ直すため）
  useEffect(() => {
    if (!expired || pending) return;
    setOn(false);
    setExpired(false);
  }, [expired, pending]);

  /** 何かした（流す・打つ）。10 分を数え直す */
  const touch = useCallback(() => {
    if (!on) return;
    setExpired(false);
    setActivity((n) => n + 1);
  }, [on]);

  const start = async () => {
    const message = `このタブだけ読み取り専用を外します（接続の設定は変えません）。外している間は、流す・保存するたびに SQL を見せて確かめます。\n10 分何もしないか、タブを閉じると読み取り専用に戻ります。`;
    if (!(await confirmByEnvName(connection, `「${connection.name}」に書き込む`, message, "書き込む", "読み取り専用のままにしました。"))) return;
    setExpired(false);
    setOn(true);
  };

  const revert = () => {
    setOn(false);
    setExpired(false);
  };

  /**
   * 流す前の確かめ。読み取り専用を外している間（書き込む）はいつも SQL を見せて確かめ、読み取り専用のままなら聞かない（書く文はコアが断る）。
   * 読み取り専用でない接続は、接続の書き込む前の確かめ（write_check）のとおり: 危険な文だけ / 書き込みのたび / 環境の名前を打たせる（writeConfirmation）
   */
  const confirmRun = async (statements: SqlStatement[]): Promise<boolean> => {
    const title = `「${connection.name}」（${env}）に流しますか？`;
    if (on) return confirm({ title, message: previewOf(statements), confirmLabel: "流す", danger: true }).then((r) => r !== null);
    if (connection.read_only) return true;
    const need = writeConfirmation(connection.write_check, statements.map((s) => s.text), connection.engine);
    if (need.kind === "none") return true;
    const dangers = need.dangers.map((d) => `・${statements.length > 1 ? `${d.index}. ` : ""}${d.reason}`).join("\n");
    const message = `${dangers ? `危険な文があります:\n${dangers}\n\n` : ""}${previewOf(statements)}`;
    if (need.kind === "env_name") return confirmByEnvName(connection, title, message, "流す");
    return confirm({ title, message, confirmLabel: "流す", danger: need.dangers.length > 0 }).then((r) => r !== null);
  };

  return { on, start, revert, touch, confirmRun };
}
