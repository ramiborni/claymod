import { describe, expect, test } from "bun:test";
import { installCommand, nativeMessagingError } from "./bridge-errors";

const ID = "abcdefghijklmnopabcdefghijklmnop";

describe("nativeMessagingError", () => {
  test("a missing host gives the install command with this extension's ID", () => {
    const message = nativeMessagingError("Specified native messaging host not found.", ID);
    expect(message).toContain(installCommand(ID));
  });

  test("a forbidden origin also points at install", () => {
    const message = nativeMessagingError(
      "Access to the specified native messaging host is forbidden.",
      ID,
    );
    expect(message).toContain("doesn't allow this copy of Claymod");
    expect(message).toContain(ID);
  });

  test("a host that exits or breaks the protocol points at doctor", () => {
    expect(nativeMessagingError("Native host has exited.", ID)).toContain("claymod-bridge doctor");
    expect(
      nativeMessagingError("Error when communicating with the native messaging host.", ID),
    ).toContain("claymod-bridge doctor");
  });

  test("a host that can't start points at install and doctor", () => {
    const message = nativeMessagingError("Failed to start native messaging host.", ID);
    expect(message).toContain("install");
    expect(message).toContain("doctor");
  });

  test("unknown messages are shown with a next step", () => {
    expect(nativeMessagingError("Something new", ID)).toBe(
      "Couldn't reach claymod-bridge (Something new). Run 'claymod-bridge doctor' in a terminal.",
    );
    expect(nativeMessagingError(undefined, ID)).toContain("claymod-bridge doctor");
  });
});
