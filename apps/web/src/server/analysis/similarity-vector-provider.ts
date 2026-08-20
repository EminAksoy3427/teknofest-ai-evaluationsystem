import type { SimilaritySectionCandidate, SimilaritySectionMetadata } from "@teknofest-ai/shared";

export interface SimilarityVectorMatch {
  metadata: SimilaritySectionMetadata;
  score: number;
}

export interface SimilarityVectorProvider {
  /**
   * Indexes the sections of one AnalysisRun. Implementations must derive deterministic vector
   * identity from competition, submission, AnalysisRun and section, so that re-running the same
   * AnalysisRun rewrites the same logical vectors instead of appending duplicates, and so that a
   * later AnalysisRun of the same submission is never mistaken for an earlier one.
   */
  indexSections(
    competitionId: string,
    sections: readonly SimilaritySectionCandidate[],
  ): Promise<void>;
  findSimilarSections(input: {
    competitionId: string;
    query: SimilaritySectionCandidate;
    topK: number;
    /**
     * When present, only matches belonging to these AnalysisRuns may be returned. The similarity
     * stage passes the AnalysisRun set chosen by the P4-01A candidate contract, so semantic
     * retrieval can never widen the candidate set or let a stale run score.
     */
    analysisRunIds?: readonly string[];
  }): Promise<SimilarityVectorMatch[]>;
}
