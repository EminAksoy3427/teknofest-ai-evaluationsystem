import { describe, expect, it } from "vitest";

import { PANEL_KEYS, PANEL_LABELS, PANEL_NOTES, panelClassName } from "./workspace-panes";

// The three-pane layout has two invariants worth pinning: all three panes are operational together
// on a wide screen, and a pane the reviewer is not currently looking at stays MOUNTED. The second
// one is what keeps an unsaved score and a loaded PDF alive across a pane switch on a tablet.

describe("reviewer workspace panes", () => {
  it("names and describes every pane", () => {
    expect(PANEL_KEYS).toEqual(["report", "ai", "rubric"]);
    for (const key of PANEL_KEYS) {
      expect(PANEL_LABELS[key].length).toBeGreaterThan(0);
      expect(PANEL_NOTES[key].length).toBeGreaterThan(0);
    }
  });

  it("keeps the middle pane honest about being advisory only", () => {
    expect(PANEL_LABELS.ai).toBe("AI 3. Göz");
    expect(PANEL_NOTES.ai).toMatch(/karar desteği/i);
    expect(PANEL_NOTES.ai).toContain("yerine geçmez");
    expect(PANEL_NOTES.rubric).toContain("Hakem kararı");
    expect(PANEL_LABELS.ai).not.toContain("AI 4. Göz");
  });

  it("shows all three panes at the xl breakpoint regardless of the active pane", () => {
    for (const active of PANEL_KEYS) {
      for (const key of PANEL_KEYS) {
        expect(panelClassName(active, key)).toContain("xl:flex");
      }
    }
  });

  it("hides rather than unmounts the panes that are not active on a narrow screen", () => {
    expect(panelClassName("report", "report")).toContain("flex");
    expect(panelClassName("report", "report")).not.toContain("hidden");
    // `hidden` is a visibility class: the inactive pane is still rendered, so switching back to it
    // never reloads the report and never loses an unsaved score.
    expect(panelClassName("report", "rubric")).toContain("hidden");
    expect(panelClassName("report", "ai")).toContain("hidden");
  });
});
