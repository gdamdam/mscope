import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { ReportPanel } from "./ReportPanel";
import { MeasurementSession } from "../state/session";
import { toJson, toMarkdown } from "../state/report";

function summaryFixture() {
  return new MeasurementSession().summary();
}

describe("ReportPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes onReset when Reset session is clicked", () => {
    const onReset = vi.fn();
    const s = summaryFixture();
    const view = render(
      createElement(ReportPanel, {
        summary: s,
        onReset,
        exportJson: () => toJson(s),
        exportMarkdown: () => toMarkdown(s),
      }),
    );
    const btn = view.container.querySelector(
      'button[aria-label="Reset session"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(onReset).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("triggers a Blob download with valid JSON on Export JSON", () => {
    const s = summaryFixture();
    // jsdom does not implement object URLs; provide stubs to spy on.
    URL.createObjectURL = (() => "blob:fake") as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    // Capture the Blob handed to createObjectURL.
    const created: Blob[] = [];
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((b: Blob | MediaSource) => {
        created.push(b as Blob);
        return "blob:fake";
      });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    // Block the synthetic anchor from actually navigating in jsdom.
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const view = render(
      createElement(ReportPanel, {
        summary: s,
        onReset: () => {},
        exportJson: () => toJson(s),
        exportMarkdown: () => toMarkdown(s),
      }),
    );
    const btn = view.container.querySelector(
      'button[aria-label="Export JSON"]',
    ) as HTMLButtonElement;
    btn.click();

    expect(createSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(created[0].type).toBe("application/json");
    view.unmount();
  });
});
