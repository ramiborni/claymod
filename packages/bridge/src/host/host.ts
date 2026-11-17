import type { BridgeResponse } from "@claymod/core/bridge-protocol";
import type { Dispatch } from "./dispatch";
import { encodeFrame, FrameDecoder } from "./framing";

export interface HostIo {
  input: AsyncIterable<Uint8Array>;
  write(frame: Uint8Array): Promise<void>;
  /** Diagnostics go to stderr: anything else on stdout breaks the protocol. */
  log(message: string): void;
}

const tooLarge = (id: string): BridgeResponse => ({
  id,
  ok: false,
  error: {
    kind: "too-large",
    message:
      "The agent's answer is larger than Chrome accepts (1 MiB). Ask for a smaller change and try again.",
  },
});

const unreadable: BridgeResponse = {
  id: "",
  ok: false,
  error: {
    kind: "bad-request",
    message:
      "The bridge received a message it couldn't read. Update claymod-bridge and the extension to their latest versions.",
  },
};

function frameFor(response: BridgeResponse): Uint8Array {
  const encoded = encodeFrame(response);
  if (encoded.ok) return encoded.frame;
  const fallback = encodeFrame(tooLarge(response.id));
  if (!fallback.ok) throw new Error("The too-large error is a few bytes; it always fits.");
  return fallback.frame;
}

/**
 * The native messaging host: reads framed requests from Chrome, answers each one as soon as it
 * is ready, and stops every running agent when Chrome closes the connection (stdin ends).
 */
export async function runHost(io: HostIo, dispatch: Dispatch): Promise<void> {
  const decoder = new FrameDecoder();
  const shutdown = new AbortController();
  const pending = new Set<Promise<void>>();
  let writes = Promise.resolve();

  const send = (response: BridgeResponse) => {
    const frame = frameFor(response);
    writes = writes.then(() => io.write(frame)).catch((error) => io.log(`write failed: ${error}`));
    return writes;
  };

  const handle = (message: unknown) => {
    const task = dispatch(message, shutdown.signal)
      .then(send)
      .catch((error) => io.log(`request failed: ${error}`))
      .finally(() => pending.delete(task));
    pending.add(task);
  };

  try {
    reading: for await (const chunk of io.input) {
      for (const frame of decoder.push(chunk)) {
        if (frame.ok) {
          handle(frame.message);
          continue;
        }
        io.log(`unreadable message: ${frame.error}`);
        await send(unreadable);
        if (frame.error === "too-large") break reading;
      }
    }
  } finally {
    shutdown.abort();
    await Promise.allSettled([...pending]);
    await writes;
  }
}
