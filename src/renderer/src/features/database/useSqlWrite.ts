import { useCallback, useEffect, useRef, useState } from "react";
import type { SqlStatement } from "@shared/database/sqlStatements";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { alertDialog, confirmDialog, promptDialog } from "@/ui/dialogs";

/** 「書き込む」を何もしないまま放っておいたら、読み取り専用に戻すまでの時間 */
const SQL_WRITE_IDLE_MS = 10 * 60_000;

/** 流す前の確かめに見せる SQL の長さ（長い文は頭だけ） */
const PREVIEW_CHARS = 1200;

/** 確かめのダイアログに見せる SQL（文ごとに番号を付け、長ければ頭だけ） */
function previewOf(statements: SqlStatement[]): string {
  const lines = statements.map((s, i) => `${statements.length > 1 ? `${i + 1}. ` : ""}${s.text}`).join("\n\n");
  return lines.length > PREVIEW_CHARS ? `${lines.slice(0, PREVIEW_CHARS)}…（${lines.length.toLocaleString()} 文字）` : lines;
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
    const typed = await promptDialog({
      title: `「${connection.name}」に書き込む`,
      message: `このタブだけ読み取り専用を外します（接続の設定は変えません）。外している間は、流すたびに SQL を見せて確かめます。\n10 分何もしないか、タブを閉じると読み取り専用に戻ります。`,
      label: `確かめのため、環境の名前「${env}」を入れてください`,
      placeholder: env,
      confirmLabel: "書き込む",
    });
    if (typed === null) return;
    if (typed !== env) return alertDialog("環境の名前が違います", `「${env}」と入れてください。読み取り専用のままにしました。`);
    setExpired(false);
    setOn(true);
  };

  const revert = () => {
    setOn(false);
    setExpired(false);
  };

  /** 流す前の確かめ（書き込む間だけ。読み取り専用のときは聞かない） */
  const confirmRun = async (statements: SqlStatement[]): Promise<boolean> => {
    if (!on) return true;
    return confirmDialog({
      title: `「${connection.name}」（${env}）に流しますか？`,
      message: previewOf(statements),
      confirmLabel: "流す",
      danger: true,
    });
  };

  return { on, start, revert, touch, confirmRun };
}
