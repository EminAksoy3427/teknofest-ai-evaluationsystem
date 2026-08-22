import {
  ApiErrorResponseSchema,
  EligibleContestantListResponseSchema,
  SubmissionParticipantListResponseSchema,
  SubmissionParticipantSchema,
} from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFullTestApp, type FullTestApp } from "./test-fixtures/full-app";
import type { LocalD1 } from "./test-fixtures/local-d1";
import { createMemoryDocumentStorage } from "./test-fixtures/memory-document-storage";
import { createP65World, P65 } from "./test-fixtures/p65a-world-seed";

// Real repositories, real membership lookup, real DB constraints — over the full generated
// migration chain, exactly like every other P6.5A route suite.

let local: LocalD1;
let harness: FullTestApp;

beforeEach(() => {
  local = createP65World();
  harness = createFullTestApp(local, createMemoryDocumentStorage().storage);
});

afterEach(() => {
  local.close();
});

function participantsPath(competitionId: string, submissionId: string) {
  return `/api/v1/competitions/${competitionId}/submissions/${submissionId}/participants`;
}

describe("submission participant management: authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    const response = await harness.request(
      null,
      participantsPath(P65.competitionA, P65.submissionA1),
    );
    expect(response.status).toBe(401);
  });

  it("denies a reviewer", async () => {
    const response = await harness.request(
      P65.reviewerOne,
      participantsPath(P65.competitionA, P65.submissionA1),
    );
    expect(response.status).toBe(403);
  });

  it("denies an evaluation manager", async () => {
    const response = await harness.request(
      P65.evaluationManager,
      participantsPath(P65.competitionA, P65.submissionA1),
    );
    expect(response.status).toBe(403);
  });

  it("denies a contestant, including the one already attached", async () => {
    const response = await harness.request(
      P65.contestantOne,
      participantsPath(P65.competitionA, P65.submissionA1),
      { method: "POST", body: { userId: P65.contestantOne } },
    );
    expect(response.status).toBe(403);
  });

  it("allows the competition manager", async () => {
    const response = await harness.request(
      P65.manager,
      participantsPath(P65.competitionA, P65.submissionA1),
    );
    expect(response.status).toBe(200);
  });
});

describe("submission participant management: ownership rules", () => {
  it("a contestant cannot self-attach to an arbitrary submission", async () => {
    const response = await harness.request(
      P65.contestantTwo,
      participantsPath(P65.competitionA, P65.submissionA1),
      { method: "POST", body: { userId: P65.contestantTwo } },
    );
    expect(response.status).toBe(403);
    const list = SubmissionParticipantListResponseSchema.parse(
      await (
        await harness.request(P65.manager, participantsPath(P65.competitionA, P65.submissionA1))
      ).json(),
    );
    expect(list.participants.map((p) => p.userId)).not.toContain(P65.contestantTwo);
  });

  it("the manager can attach a second contestant to the same submission", async () => {
    const response = await harness.request(
      P65.manager,
      participantsPath(P65.competitionA, P65.submissionA1),
      { method: "POST", body: { userId: P65.contestantTwo } },
    );
    expect(response.status).toBe(201);
    const created = SubmissionParticipantSchema.parse(await response.json());
    expect(created.userId).toBe(P65.contestantTwo);
    expect(created.submissionId).toBe(P65.submissionA1);
  });

  it("rejects a duplicate mapping", async () => {
    const response = await harness.request(
      P65.manager,
      participantsPath(P65.competitionA, P65.submissionA1),
      { method: "POST", body: { userId: P65.contestantOne } },
    );
    expect(response.status).toBe(409);
  });

  it("rejects attaching a member who does not hold the CONTESTANT role in this competition", async () => {
    const response = await harness.request(
      P65.manager,
      participantsPath(P65.competitionA, P65.submissionA1),
      { method: "POST", body: { userId: P65.reviewerOne } },
    );
    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("CONFLICT");
  });

  it("does not let a manager attach a user from another competition, even by id", async () => {
    // foreignContestant is a CONTESTANT, but only in competition B.
    const response = await harness.request(
      P65.manager,
      participantsPath(P65.competitionA, P65.submissionA1),
      { method: "POST", body: { userId: P65.foreignContestant } },
    );
    expect(response.status).toBe(409);
    const list = SubmissionParticipantListResponseSchema.parse(
      await (
        await harness.request(P65.manager, participantsPath(P65.competitionA, P65.submissionA1))
      ).json(),
    );
    expect(list.participants.map((p) => p.userId)).not.toContain(P65.foreignContestant);
  });

  it("does not let a manager attach a participant to a submission from another competition", async () => {
    // submissionB1 belongs to competition B; competitionA's manager must not reach it.
    const response = await harness.request(
      P65.manager,
      participantsPath(P65.competitionA, P65.submissionB1),
      { method: "POST", body: { userId: P65.contestantOne } },
    );
    expect([403, 404, 409]).toContain(response.status);
    const rows = local.query(
      "SELECT * FROM submission_participant WHERE submission_id = ?",
      P65.submissionB1,
    );
    expect(rows).toEqual([]);
  });

  it("removes a participant", async () => {
    const response = await harness.request(
      P65.manager,
      `${participantsPath(P65.competitionA, P65.submissionA1)}/${P65.participantA1}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);
    const list = SubmissionParticipantListResponseSchema.parse(
      await (
        await harness.request(P65.manager, participantsPath(P65.competitionA, P65.submissionA1))
      ).json(),
    );
    expect(list.participants).toEqual([]);
  });
});

describe("eligible contestants listing", () => {
  it("lists only CONTESTANT members of this competition", async () => {
    const response = await harness.request(
      P65.manager,
      `/api/v1/competitions/${P65.competitionA}/contestants`,
    );
    expect(response.status).toBe(200);
    const body = EligibleContestantListResponseSchema.parse(await response.json());
    const userIds = body.contestants.map((c) => c.userId);
    expect(userIds).toContain(P65.contestantOne);
    expect(userIds).toContain(P65.contestantTwo);
    expect(userIds).not.toContain(P65.reviewerOne);
    expect(userIds).not.toContain(P65.foreignContestant);
  });
});
