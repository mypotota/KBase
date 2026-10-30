// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect } from "vitest";
import { MarqueeText } from "../src/marquee-text";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("MarqueeText", () => {
  it("truncates short labels without starting a marquee pass", async () => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    await act(async () => root.render(<MarqueeText>短标题</MarqueeText>));
    const inner = element.querySelector("span span")!;
    expect(inner.className).toContain("truncate");
    expect(inner.className).not.toContain("marquee-run");
    await act(async () => root.unmount());
    element.remove();
  });

  it("sweeps overflowing labels on hover and stops on leave", async () => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    await act(async () =>
      root.render(<MarqueeText>这是一段非常长的标题需要跑马灯</MarqueeText>),
    );
    const outer = element.querySelector("span")!;
    const inner = outer.querySelector("span")!;
    // jsdom reports zero layout, so the overflow distance is stubbed.
    Object.defineProperty(inner, "scrollWidth", { value: 320 });
    Object.defineProperty(inner, "clientWidth", { value: 120 });
    await act(async () => {
      outer.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const running = outer.querySelector("span")!;
    expect(running.className).toContain("marquee-run");
    expect(running.className).not.toContain("truncate");
    expect(running.getAttribute("style")).toContain("--marquee-shift");
    expect(running.getAttribute("style")).toContain("--marquee-duration");
    await act(async () => {
      outer.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(outer.querySelector("span")!.className).toContain("truncate");
    await act(async () => root.unmount());
    element.remove();
  });
});
