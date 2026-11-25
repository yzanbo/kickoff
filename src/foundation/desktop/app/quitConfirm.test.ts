import assert from "node:assert/strict";
import { test } from "vitest";
import { deferred } from "@shared/foundation/testing/async";
import { createQuitRequest, quitConfirmText } from "./quitConfirm";

test("終了してよいかの文: 件数を見出しに、名前を 5 件まで並べ、残りは数だけ（名前のないチャットの既定の名前はコアが付ける）", () => {
  const one = quitConfirmText([{ title: "調べもの" }]);
  assert.equal(one.message, "作業中のチャットが 1 件あります");
  assert.equal(one.detail, "・調べもの\n\n終了すると作業が止まります。次に起動したときに、続けるかを聞きます。");
  const many = quitConfirmText([{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }, { title: "e" }, { title: "f" }, { title: "g" }]);
  assert.equal(many.message, "作業中のチャットが 7 件あります");
  assert.deepEqual(many.detail.split("\n").slice(0, 6), ["・a", "・b", "・c", "・d", "・e", "ほか 2 件"]);
});

test("終了をやめたときは片付けず、次に了承したときだけ片付ける", async () => {
  const answer = deferred<boolean>();
  const closed: string[] = [];
  let confirmations = 0;
  const quit = createQuitRequest({
    running: async (core: string) => [{ title: core }],
    confirm: async () => ++confirmations === 1 ? answer.promise : true,
    close: (core) => closed.push(core),
  });
  const cancelled = quit("最初", false);
  assert.deepEqual(closed, []);
  answer.resolve(false);
  await cancelled;
  assert.deepEqual(closed, []);
  await quit("了承", false);
  await quit("もう一度", true);
  assert.deepEqual(closed, ["了承"]);
});

test("確認中の再度の終了では先に片付け、遅れて確認が戻っても二度は片付けない", async () => {
  const answer = deferred<boolean>();
  const asked = deferred<void>();
  const closed: string[] = [];
  const quit = createQuitRequest({
    running: async (core: string) => [{ title: core }],
    confirm: () => {
      asked.resolve();
      return answer.promise;
    },
    close: (core) => closed.push(core),
  });
  const first = quit("最初", false);
  await asked.promise;
  await quit("再度", false);
  answer.resolve(true);
  await first;
  assert.deepEqual(closed, ["再度"]);
});
