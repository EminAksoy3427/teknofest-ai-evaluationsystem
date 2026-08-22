export const PANEL_KEYS = ["report", "ai", "rubric"] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];

export const PANEL_LABELS = {
  report: "Rapor",
  ai: "AI 4. Göz",
  rubric: "Hakem Rubriği",
} as const satisfies Record<PanelKey, string>;

/**
 * One-line purpose for each pane, so the division of labour is legible at a glance: the left pane is
 * the source document, the middle pane is advisory, the right pane is where the human decides.
 */
export const PANEL_NOTES = {
  report: "Başvuru raporunun kendisi · kanıt bağlantıları buraya götürür",
  ai: "Kaydedilmiş analiz sinyalleri · yalnız öneri, karar değil",
  rubric: "Hakem kararı · puanı yalnız siz belirlersiniz",
} as const satisfies Record<PanelKey, string>;

/**
 * Responsive pane visibility.
 *
 * At `xl` and wider all three panes are operational at once. Below that breakpoint exactly one pane
 * is visible, chosen by the switcher — but an inactive pane is only `hidden`, never unmounted, so
 * switching panes never reloads the report and never discards an unsaved score.
 */
export function panelClassName(activePanel: PanelKey, key: PanelKey): string {
  return `${activePanel === key ? "flex" : "hidden"} workspace-pane xl:flex`;
}
