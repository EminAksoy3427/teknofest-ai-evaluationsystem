import { CATEGORY_FIT_INSTRUCTIONS } from "./category-fit/v1";
import { SECTION_CONTENT_INSTRUCTIONS } from "./section-content/v1";

export const SEMANTIC_PROMPT_BUNDLE_VERSION = "semantic-checks/v1";

export const semanticPromptBundleV1 = {
  version: SEMANTIC_PROMPT_BUNDLE_VERSION,
  sectionContentInstructions: SECTION_CONTENT_INSTRUCTIONS,
  categoryFitInstructions: CATEGORY_FIT_INSTRUCTIONS,
} as const;

export function getSemanticPromptBundle(version: string) {
  if (version !== SEMANTIC_PROMPT_BUNDLE_VERSION) {
    throw new Error("Desteklenmeyen semantik prompt paketi.");
  }
  return semanticPromptBundleV1;
}
