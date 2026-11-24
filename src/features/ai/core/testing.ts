// ほかの機能のテストが読む AI の偽物（台本どおりに動く ScriptedProvider・作業の終わりを待たせる gatedScript・組み立てたコアの FakeProvider・偽の Claude Agent SDK）。テストからだけ使う
export { FakeProvider, gatedScript, ScriptedProvider, type Script } from "./testing/fakeProvider";
export { fakeClaudeSdk, type FakeClaudeSdk } from "./testing/fakeClaudeSdk";
