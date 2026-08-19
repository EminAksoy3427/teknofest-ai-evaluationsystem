import { LIFECYCLE_STATUS_VALUES } from "@teknofest-ai/shared";
import { sql } from "drizzle-orm";

const quotedLifecycleStatuses = LIFECYCLE_STATUS_VALUES.map((status) => `'${status}'`).join(", ");

export const lifecycleStatusValuesSql = sql.raw(`(${quotedLifecycleStatuses})`);

// ARCHIVED yalnızca P1-01'den kalmış satırların kayıpsız taşınması için okunabilir.
// P2-01 repository işlemleri yeni tarihsel sürümleri RETIRED olarak yazar.
export const PERSISTED_VERSION_STATUS_VALUES = ["DRAFT", "ACTIVE", "ARCHIVED", "RETIRED"] as const;

const quotedVersionStatuses = PERSISTED_VERSION_STATUS_VALUES.map((status) => `'${status}'`).join(
  ", ",
);

export const versionStatusValuesSql = sql.raw(`(${quotedVersionStatuses})`);
