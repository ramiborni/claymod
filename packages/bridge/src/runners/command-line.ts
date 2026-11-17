import { err, ok, type Result } from "@claymod/core";

/**
 * Linux caps one argument at 128 KiB; Windows caps the whole command line at 32,767 characters.
 * Prompts normally go on stdin, but Antigravity takes its prompt as an argument.
 */
export function maxArgumentChars(platform: NodeJS.Platform): number {
  return platform === "win32" ? 32_000 : 120_000;
}

/**
 * npm installs CLIs on Windows as .cmd shims, which only cmd.exe can start. cmd.exe expands %
 * and treats quotes specially, so arguments with those characters (or line breaks) are refused
 * rather than escaped.
 */
export function commandLine(
  executable: string,
  args: string[],
  platform: NodeJS.Platform,
): Result<string[], string> {
  const total = executable.length + args.reduce((sum, arg) => sum + arg.length + 3, 0);
  const longest = Math.max(0, ...args.map((arg) => arg.length));
  if ((platform === "win32" ? total : longest) > maxArgumentChars(platform)) {
    return err("too-long");
  }
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(executable)) {
    return ok([executable, ...args]);
  }
  if ([executable, ...args].some((arg) => /["%\r\n]/.test(arg))) return err("unsafe-for-cmd");
  const quoted = [executable, ...args].map((arg) => `"${arg}"`).join(" ");
  return ok(["cmd.exe", "/d", "/s", "/c", `"${quoted}"`]);
}
