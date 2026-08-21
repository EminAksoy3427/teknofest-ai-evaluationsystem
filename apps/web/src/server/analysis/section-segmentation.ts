import type {
  AISectionInput,
  CategoryFitAnalysisInput,
  RubricCriterionInput,
  RubricEvaluationAnalysisInput,
} from "@teknofest-ai/ai";
import {
  type CategorySnapshot,
  type DocumentExtractionArtifact,
  MAX_CATEGORY_SAMPLE_CHARACTERS,
  MAX_CATEGORY_SAMPLE_PAGES,
  MAX_RUBRIC_SAMPLE_CHARACTERS,
  MAX_RUBRIC_SAMPLE_PAGES,
  MAX_SEMANTIC_SECTION_CHARACTERS,
  MAX_SEMANTIC_SECTION_PAGES,
  type SemanticSourceCoverage,
  type TemplateStructuralProfile,
} from "@teknofest-ai/shared";

import { normalizeHeading } from "./structural-checks";

export interface SegmentedSection {
  sectionKey: string;
  title: string;
  description: string;
  required: boolean;
  startPage: number | null;
  endPage: number | null;
  pages: Array<{ page: number; text: string }>;
  text: string;
  sourceCoverage: SemanticSourceCoverage;
}

interface DocumentLine {
  page: number;
  order: number;
  text: string;
}

function selectEvenly<T>(values: readonly T[], maximum: number): T[] {
  if (values.length <= maximum) return [...values];
  const result: T[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round((index * (values.length - 1)) / (maximum - 1));
    const value = values[sourceIndex];
    if (value !== undefined && result.at(-1) !== value) result.push(value);
  }
  return result;
}

function representativeText(text: string, maximum: number): string {
  if (text.length <= maximum) return text;
  const part = Math.max(1, Math.floor((maximum - 6) / 3));
  const middle = Math.max(0, Math.floor(text.length / 2 - part / 2));
  return `${text.slice(0, part)}\n…\n${text.slice(middle, middle + part)}\n…\n${text.slice(-part)}`.slice(
    0,
    maximum,
  );
}

function boundPages(
  pages: Array<{ page: number; text: string }>,
  maximumPages: number,
  maximumCharacters: number,
): { pages: Array<{ page: number; text: string }>; sampled: boolean } {
  const sourceCharacters = pages.reduce((total, page) => total + page.text.length, 0);
  const selected = selectEvenly(pages, maximumPages);
  const sampled = selected.length < pages.length || sourceCharacters > maximumCharacters;
  let remaining = maximumCharacters;
  const bounded = selected
    .map((page, index) => {
      const pagesLeft = selected.length - index;
      const budget = Math.max(1, Math.floor(remaining / pagesLeft));
      const text = representativeText(page.text, budget);
      remaining -= text.length;
      return { page: page.page, text };
    })
    .filter((page) => page.text.trim().length > 0);
  return { pages: bounded, sampled };
}

export function segmentDocumentSections(
  artifact: DocumentExtractionArtifact,
  profile: TemplateStructuralProfile,
): SegmentedSection[] {
  const targets = new Map(
    profile.sections.map((section) => [normalizeHeading(section.title), section]),
  );
  const lines: DocumentLine[] = [];
  let order = 0;
  for (const page of artifact.pages) {
    for (const text of page.text.split("\n"))
      lines.push({ page: page.pageNumber, order: order++, text });
  }

  const firstHeadings = new Map<string, DocumentLine>();
  const allHeadings: Array<{ line: DocumentLine; sectionKey: string }> = [];
  for (const line of lines) {
    const headingCandidate = line.text.trim();
    if (
      !headingCandidate ||
      headingCandidate.length > 160 ||
      headingCandidate.split(/\s+/).length > 16
    ) {
      continue;
    }
    const section = targets.get(normalizeHeading(headingCandidate));
    if (!section) continue;
    allHeadings.push({ line, sectionKey: section.key });
    if (!firstHeadings.has(section.key)) firstHeadings.set(section.key, line);
  }
  allHeadings.sort((a, b) => a.line.order - b.line.order);

  return profile.sections.map((section) => {
    const heading = firstHeadings.get(section.key);
    if (!heading) {
      return {
        sectionKey: section.key,
        title: section.title,
        description: section.description,
        required: section.required,
        startPage: null,
        endPage: null,
        pages: [],
        text: "",
        sourceCoverage: "MISSING_SECTION",
      };
    }
    const nextHeading = allHeadings.find((candidate) => candidate.line.order > heading.order);
    const body = lines.filter(
      (line) =>
        line.order > heading.order &&
        line.order < (nextHeading?.line.order ?? Number.MAX_SAFE_INTEGER),
    );
    const pageMap = new Map<number, string[]>();
    for (const line of body) {
      const current = pageMap.get(line.page) ?? [];
      current.push(line.text);
      pageMap.set(line.page, current);
    }
    const pages = [...pageMap.entries()]
      .map(([page, pageLines]) => ({ page, text: pageLines.join("\n").trim() }))
      .filter((page) => page.text.length > 0);
    const bounded = boundPages(pages, MAX_SEMANTIC_SECTION_PAGES, MAX_SEMANTIC_SECTION_CHARACTERS);
    return {
      sectionKey: section.key,
      title: section.title,
      description: section.description,
      required: section.required,
      startPage: heading.page,
      endPage: pages.at(-1)?.page ?? heading.page,
      pages: bounded.pages,
      text: pages.map((page) => page.text).join("\n"),
      sourceCoverage: bounded.sampled ? "SAMPLED" : "FULL",
    };
  });
}

export function sectionProviderInput(sections: readonly SegmentedSection[]): AISectionInput[] {
  return sections
    .filter((section) => section.sourceCoverage !== "MISSING_SECTION")
    .map((section) => ({
      sectionKey: section.sectionKey,
      title: section.title,
      description: section.description,
      required: section.required,
      sourceCoverage: section.sourceCoverage as "FULL" | "SAMPLED",
      pages: section.pages,
    }));
}

export function categoryProviderInput(
  artifact: DocumentExtractionArtifact,
  category: CategorySnapshot,
  projectTitle: string,
): CategoryFitAnalysisInput {
  const bounded = boundPages(
    artifact.pages.map((page) => ({ page: page.pageNumber, text: page.text })),
    MAX_CATEGORY_SAMPLE_PAGES,
    MAX_CATEGORY_SAMPLE_CHARACTERS,
  );
  return {
    category,
    projectTitle,
    sourceCoverage: bounded.sampled ? "SAMPLED" : "FULL",
    pages: bounded.pages,
  };
}

/**
 * Rubric criteria are evaluated holistically against a bounded whole-document sample, the same
 * shape CATEGORY_FIT uses, rather than per-section: a criterion is not reliably mapped to one
 * template section.
 */
export function rubricProviderInput(
  artifact: DocumentExtractionArtifact,
  criteria: readonly RubricCriterionInput[],
): RubricEvaluationAnalysisInput {
  const bounded = boundPages(
    artifact.pages.map((page) => ({ page: page.pageNumber, text: page.text })),
    MAX_RUBRIC_SAMPLE_PAGES,
    MAX_RUBRIC_SAMPLE_CHARACTERS,
  );
  return {
    criteria: [...criteria],
    sourceCoverage: bounded.sampled ? "SAMPLED" : "FULL",
    pages: bounded.pages,
  };
}
