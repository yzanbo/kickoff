// 後片付けを頼む口（テストからだけ使う）。テストの中で呼べばそのテストのあと、ファイルの上で呼べばそのファイルのテストがすべて終わったあと
import { afterAll, onTestFinished, TestRunner } from "vitest";

export function afterTest(fn: () => unknown): void {
  if (TestRunner.getCurrentTest()) onTestFinished(async () => void (await fn()));
  else afterAll(async () => void (await fn()));
}
