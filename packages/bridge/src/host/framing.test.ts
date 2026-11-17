import { describe, expect, test } from "bun:test";
import { MAX_HOST_MESSAGE_BYTES } from "@claymod/core/bridge-protocol";
import { encodeFrame, FrameDecoder, NATIVE_LITTLE_ENDIAN } from "./framing";

function frameOf(message: unknown): Uint8Array {
  const encoded = encodeFrame(message);
  if (!encoded.ok) throw new Error("test message too large");
  return encoded.frame;
}

describe("encodeFrame", () => {
  test("prefixes the UTF-8 byte length in native byte order", () => {
    const frame = frameOf({ a: "é" });
    const body = new TextEncoder().encode('{"a":"é"}');
    expect(new DataView(frame.buffer).getUint32(0, NATIVE_LITTLE_ENDIAN)).toBe(body.byteLength);
    expect(frame.subarray(4)).toEqual(body);
  });

  test("honours an explicit byte order", () => {
    const big = encodeFrame({}, MAX_HOST_MESSAGE_BYTES, false);
    expect(big.ok && Array.from(big.frame.subarray(0, 4))).toEqual([0, 0, 0, 2]);
    const little = encodeFrame({}, MAX_HOST_MESSAGE_BYTES, true);
    expect(little.ok && Array.from(little.frame.subarray(0, 4))).toEqual([2, 0, 0, 0]);
  });

  test("refuses messages Chrome would reject (over 1 MiB)", () => {
    const result = encodeFrame({ text: "x".repeat(MAX_HOST_MESSAGE_BYTES) });
    expect(result.ok).toBe(false);
    expect(result.ok ? 0 : result.size).toBeGreaterThan(MAX_HOST_MESSAGE_BYTES);
  });

  test("accepts a message of exactly the limit", () => {
    const overhead = JSON.stringify({ t: "" }).length;
    const exact = { t: "x".repeat(MAX_HOST_MESSAGE_BYTES - overhead) };
    expect(encodeFrame(exact).ok).toBe(true);
  });
});

describe("FrameDecoder", () => {
  test("decodes several messages from one chunk", () => {
    const decoder = new FrameDecoder();
    const chunk = new Uint8Array([...frameOf({ n: 1 }), ...frameOf({ n: 2 })]);
    expect(decoder.push(chunk)).toEqual([
      { ok: true, message: { n: 1 } },
      { ok: true, message: { n: 2 } },
    ]);
  });

  test("reassembles messages split byte by byte, including multibyte characters", () => {
    const decoder = new FrameDecoder();
    const frame = frameOf({ text: "naïve 🧱 mod" });
    const out = [];
    for (const byte of frame) out.push(...decoder.push(new Uint8Array([byte])));
    expect(out).toEqual([{ ok: true, message: { text: "naïve 🧱 mod" } }]);
    expect(decoder.pendingBytes).toBe(0);
  });

  test("keeps a partial header until the rest arrives", () => {
    const decoder = new FrameDecoder();
    const frame = frameOf({ ok: true });
    expect(decoder.push(frame.subarray(0, 2))).toEqual([]);
    expect(decoder.pendingBytes).toBe(2);
    expect(decoder.push(frame.subarray(2))).toEqual([{ ok: true, message: { ok: true } }]);
  });

  test("reports invalid JSON and keeps going", () => {
    const decoder = new FrameDecoder();
    const bad = new TextEncoder().encode("{nope");
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, bad.byteLength, NATIVE_LITTLE_ENDIAN);
    const out = decoder.push(new Uint8Array([...header, ...bad, ...frameOf({ after: 1 })]));
    expect(out).toEqual([
      { ok: false, error: "invalid-json" },
      { ok: true, message: { after: 1 } },
    ]);
  });

  test("rejects invalid UTF-8", () => {
    const decoder = new FrameDecoder();
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, 1, NATIVE_LITTLE_ENDIAN);
    expect(decoder.push(new Uint8Array([...header, 0xff]))).toEqual([
      { ok: false, error: "invalid-json" },
    ]);
  });

  test("decodes a zero-length body as invalid JSON", () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(new Uint8Array(4))).toEqual([{ ok: false, error: "invalid-json" }]);
  });

  test("stops for good when a header announces more than the limit", () => {
    const decoder = new FrameDecoder(16);
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, 17, NATIVE_LITTLE_ENDIAN);
    expect(decoder.push(header)).toEqual([{ ok: false, error: "too-large", size: 17 }]);
    expect(decoder.push(frameOf({}))).toEqual([]);
  });
});
