export { assertDatabaseConnection, createDb, type Database } from "./client";
export {
  activateRubricVersion,
  activateTemplateVersion,
  type CompetitionConfigurationRepository,
  ConfigurationRepositoryError,
  type ConfigurationRepositoryErrorCode,
  type ConfigurationRepositoryErrorReason,
  competitionConfigurationRepository,
  createCategory,
  createCompetitionWithManager,
  createRubricVersion,
  createTemplateVersion,
  deleteCategory,
  findCompetition,
  getCompetitionConfiguration,
  listCategories,
  listRubricVersions,
  listTemplateVersions,
  replaceDraftCriteria,
  updateCategory,
  updateCompetition,
  updateDraftRubricVersion,
  updateDraftTemplateVersion,
} from "./competition-configuration";
export {
  type CompetitionMembership,
  type CompetitionMembershipLookup,
  findCompetitionMembership,
  listMembershipSummaries,
  type MembershipSummaryList,
} from "./competition-membership";
export * from "./schema";
