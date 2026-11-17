import type { PickedElement } from "@claymod/core/snapshot";

/** Messages from the background to the content script. */
export type PageMessage =
  | { type: "claymod:ping" }
  | { type: "claymod:pick" }
  | { type: "claymod:cancelPick" }
  | { type: "claymod:snapshot" };

export interface PageSnapshot {
  url: string;
  title: string;
  outline: string;
}

export type PageReply<T extends PageMessage["type"]> = T extends "claymod:pick"
  ? PickedElement | null
  : T extends "claymod:snapshot"
    ? PageSnapshot
    : true;

/** Elements Claymod adds to the page (picker overlay) carry this attribute. */
export const CLAYMOD_ATTR = "data-claymod-ui";
