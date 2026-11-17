import { readConfig } from "../config";
import type { Command } from "../context";
import { createAgentLink } from "../host/agent-link";
import { createDispatcher } from "../host/dispatch";
import { runHost } from "../host/host";
import { linkPaths } from "../mcp/link-paths";
import { configDir } from "../paths";
import { RUNNERS } from "../runners";

export const HOST_HELP = `Usage: claymod-bridge host

The native messaging host. Chrome starts it (with the extension's origin as the only argument);
you don't run it yourself. Use 'claymod-bridge doctor' to check the setup.`;

/**
 * Chrome checks allowed_origins before starting the host; checking the origin again here means
 * a manifest edited by hand can't widen access without `install`.
 */
export const host: Command = async (args, context) => {
  if (args.includes("--help") || args.includes("-h")) {
    context.out(HOST_HELP);
    return 0;
  }
  const config = await readConfig(configDir(context));
  const origin = args.find((arg) => arg.startsWith("chrome-extension://"));
  const allowed = (config?.extensionIds ?? []).map((id) => `chrome-extension://${id}/`);
  if (origin && !allowed.includes(origin)) {
    context.err(
      `Refusing ${origin}: run 'claymod-bridge install --extension-id <id>' for this extension.`,
    );
    return 1;
  }
  const paths = linkPaths(context);
  await runHost({ ...context.stdio, log: context.err }, (push) => {
    const link = createAgentLink({
      socket: paths.socket,
      tokenFile: paths.token,
      dir: paths.dir,
      platform: context.platform,
      push,
    });
    const dispatch = createDispatcher({
      version: context.version,
      runners: RUNNERS,
      link,
      agents: {
        spawn: context.spawn,
        which: context.which,
        keys: context.keys,
        env: context.env,
        platform: context.platform,
        home: context.home,
        savedPath: config?.path,
        tmpRoot: context.tmpRoot,
      },
    });
    return { dispatch, close: () => link.close() };
  });
  return 0;
};
