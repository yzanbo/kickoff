// Metro の設定: 本体と共有する型と純粋な関数（../src/shared）を読む。@shared/* は tsconfig の paths で Expo が解く。
// ここでは変更を見張る場所に足すだけ（足さなくても読めるが、書き換えてもすぐには反映されない）
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../src/shared")];

module.exports = config;
