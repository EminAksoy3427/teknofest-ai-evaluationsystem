import { CATEGORY_FIT_INSTRUCTIONS } from "./category-fit/v1";
import { RUBRIC_EVALUATION_INSTRUCTIONS } from "./rubric-evaluation/v1";
import { SECTION_CONTENT_INSTRUCTIONS } from "./section-content/v1";

// Bundle identity is versioned as a whole because it is what an AnalysisRun pins in
// `prompt_bundle_version`. Adding the rubric-evaluation prompt changes the bundle's content, so it
// gets a new version; the old version stays resolvable (but without rubric instructions) for any
// AnalysisRun that was already pinned to it before this change shipped.
export const SEMANTIC_PROMPT_BUNDLE_VERSION = "semantic-checks/v2";

export const semanticPromptBundleV1 = {
  version: "semantic-checks/v1",
  sectionContentInstructions: SECTION_CONTENT_INSTRUCTIONS,
  categoryFitInstructions: CATEGORY_FIT_INSTRUCTIONS,
  rubricEvaluationInstructions: null,
} as const;

export const semanticPromptBundleV2 = {
  version: SEMANTIC_PROMPT_BUNDLE_VERSION,
  sectionContentInstructions: SECTION_CONTENT_INSTRUCTIONS,
  categoryFitInstructions: CATEGORY_FIT_INSTRUCTIONS,
  rubricEvaluationInstructions: RUBRIC_EVALUATION_INSTRUCTIONS,
} as const;

const bundlesByVersion = {
  [semanticPromptBundleV1.version]: semanticPromptBundleV1,
  [semanticPromptBundleV2.version]: semanticPromptBundleV2,
};

export function getSemanticPromptBundle(version: string) {
  const bundle = bundlesByVersion[version as keyof typeof bundlesByVersion];
  if (!bundle) {
    throw new Error("Desteklenmeyen semantik prompt paketi.");
  }
  return bundle;
}
