import type { Mod } from "@claymod/core/mod";

export const STYLE_ATTR = "data-claymod-mod";

/** Keeps one <style> per active mod in the page, and puts them back if the page removes them. */
export function createStyleManager() {
  const styles = new Map<string, HTMLStyleElement>();

  function apply(mods: Mod[]): void {
    const wanted = new Map(
      mods.filter((mod) => mod.css?.trim()).map((mod) => [mod.id, mod.css ?? ""]),
    );
    for (const [id, element] of styles) {
      if (wanted.has(id)) continue;
      element.remove();
      styles.delete(id);
    }
    for (const [id, css] of wanted) {
      let element = styles.get(id);
      if (!element) {
        element = document.createElement("style");
        element.setAttribute(STYLE_ATTR, id);
        styles.set(id, element);
      }
      if (element.textContent !== css) element.textContent = css;
      // At document_start <head> may not exist yet; <html> always does.
      if (!element.isConnected) (document.head ?? document.documentElement).append(element);
    }
  }

  const anyDetached = () => [...styles.values()].some((element) => !element.isConnected);

  return { apply, anyDetached };
}
