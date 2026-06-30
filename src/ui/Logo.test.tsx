import { describe, it, expect } from "vitest";
import { render } from "./testRender";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders an accessible 'mscope' heading and hides the block-art from AT", () => {
    const { container, unmount } = render(<Logo />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    // Accessible name comes from the visually-hidden span, not the block glyphs.
    expect(h1?.textContent).toContain("mscope");
    const art = container.querySelector(".scope__logo");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
    unmount();
  });
});
