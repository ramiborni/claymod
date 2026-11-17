import { MAX_HOST_MESSAGE_BYTES } from "@claymod/core/bridge-protocol";

/**
 * Chrome native messaging framing: each message is UTF-8 JSON preceded by its byte length as a
 * 32-bit unsigned integer in native byte order.
 * https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
 */

/** Chrome sends at most 64 MiB to a host. A larger header means the stream is corrupt. */
export const MAX_INCOMING_BYTES = 64 * 1024 * 1024;

const HEADER_BYTES = 4;
export const NATIVE_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export type EncodeResult = { ok: true; frame: Uint8Array } | { ok: false; size: number };

/** Encodes one message, refusing anything Chrome would reject (over 1 MiB of JSON). */
export function encodeFrame(
  message: unknown,
  maxBytes = MAX_HOST_MESSAGE_BYTES,
  littleEndian = NATIVE_LITTLE_ENDIAN,
): EncodeResult {
  const body = new TextEncoder().encode(JSON.stringify(message));
  if (body.byteLength > maxBytes) return { ok: false, size: body.byteLength };
  const frame = new Uint8Array(HEADER_BYTES + body.byteLength);
  new DataView(frame.buffer).setUint32(0, body.byteLength, littleEndian);
  frame.set(body, HEADER_BYTES);
  return { ok: true, frame };
}

export type DecodedFrame =
  | { ok: true; message: unknown }
  | { ok: false; error: "invalid-json" | "too-large"; size?: number };

/**
 * Turns a byte stream into messages. Chunks can split a header or a body anywhere, including
 * inside a multibyte character. "too-large" is fatal: the stream can't be resynchronised.
 */
export class FrameDecoder {
  private buffer: Uint8Array = new Uint8Array(0);
  private failed = false;

  constructor(
    private readonly maxBytes = MAX_INCOMING_BYTES,
    private readonly littleEndian = NATIVE_LITTLE_ENDIAN,
  ) {}

  push(chunk: Uint8Array): DecodedFrame[] {
    if (this.failed) return [];
    this.buffer = concat(this.buffer, chunk);
    const frames: DecodedFrame[] = [];
    while (this.buffer.byteLength >= HEADER_BYTES) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, HEADER_BYTES);
      const size = view.getUint32(0, this.littleEndian);
      if (size > this.maxBytes) {
        this.failed = true;
        frames.push({ ok: false, error: "too-large", size });
        return frames;
      }
      if (this.buffer.byteLength < HEADER_BYTES + size) break;
      const body = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + size);
      this.buffer = this.buffer.slice(HEADER_BYTES + size);
      frames.push(parse(body));
    }
    return frames;
  }

  /** Bytes received but not yet part of a whole message (used to spot truncated input). */
  get pendingBytes(): number {
    return this.buffer.byteLength;
  }
}

function parse(body: Uint8Array): DecodedFrame {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return { ok: true, message: JSON.parse(text) };
  } catch {
    return { ok: false, error: "invalid-json" };
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.byteLength === 0) return b.slice();
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}
