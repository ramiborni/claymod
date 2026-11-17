import { expect, test } from "bun:test";
import { userScriptsHelp } from "./user-scripts";

test("help matches the Chrome version", () => {
  const chrome140 =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";
  const chrome136 = chrome140.replace("140", "136");
  expect(userScriptsHelp("abc", chrome140)).toContain(
    'chrome://extensions/?id=abc and turn on "Allow User Scripts"',
  );
  expect(userScriptsHelp("abc", chrome136)).toContain('"Developer mode"');
});
