import { LIFECYCLE_STATUS_VALUES } from "@teknofest-ai/shared";
import { sql } from "drizzle-orm";

const quotedLifecycleStatuses = LIFECYCLE_STATUS_VALUES.map((status) => `'${status}'`).join(", ");

export const lifecycleStatusValuesSql = sql.raw(`(${quotedLifecycleStatuses})`);
