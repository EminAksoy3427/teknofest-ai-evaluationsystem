import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";

import "./styles.css";
import { AppShell, MembershipsProvider } from "./app-shell";
import { authClient } from "./auth-client";
import { authenticatedLoginDestination, unauthenticatedDestination } from "./auth-routing";
import { DashboardPage } from "./dashboard-page";
import { ForgotPasswordPage } from "./forgot-password-page";
import { LandingPage } from "./landing-page";
import { LoginPage } from "./login-page";
import { MyResultsPage } from "./my-results-page";
import { PRODUCT_NAME } from "./product-copy";
import { ProfilePage } from "./profile-page";
import { RegisterPage } from "./register-page";
import { ResetPasswordPage } from "./reset-password-page";
import { ReviewOperationsPage } from "./review-operations-page";
import { ReviewQueuePage } from "./review-queue-page";
import { ReviewWorkspacePage } from "./review-workspace-page";
import { ReviewerAssignmentsPage } from "./reviewer-assignments-page";
import { SetupPage } from "./setup-page";
import { SubmissionFeedbackPage } from "./submission-feedback-page";
import { SubmissionParticipantsPage } from "./submission-participants-page";
import { SubmissionsPage } from "./submissions-page";

function SessionPending() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6" role="status">
      <div className="text-center">
        <p className="text-[15px] font-semibold tracking-tight text-ink">{PRODUCT_NAME}</p>
        <p className="mt-2 text-sm text-ink-muted">Oturum durumu kontrol ediliyor…</p>
      </div>
    </main>
  );
}

function AuthenticatedRoutes() {
  const inShell = (page: ReactNode) => <AppShell>{page}</AppShell>;

  return (
    <MembershipsProvider>
      <Routes>
        <Route element={<ReviewWorkspacePage />} path="/app/review/:competitionId/:assignmentId" />
        <Route element={inShell(<DashboardPage />)} path="/" />
        <Route element={inShell(<DashboardPage />)} path="/app" />
        <Route element={inShell(<ProfilePage />)} path="/app/profile" />
        <Route element={inShell(<SetupPage />)} path="/app/competitions/:competitionId/setup" />
        <Route
          element={inShell(<SubmissionsPage />)}
          path="/app/competitions/:competitionId/submissions"
        />
        <Route
          element={inShell(<ReviewerAssignmentsPage />)}
          path="/app/competitions/:competitionId/reviewers"
        />
        <Route
          element={inShell(<ReviewOperationsPage />)}
          path="/app/competitions/:competitionId/operations"
        />
        <Route
          element={inShell(<SubmissionParticipantsPage />)}
          path="/app/competitions/:competitionId/submissions/:submissionId/participants"
        />
        <Route
          element={inShell(<SubmissionFeedbackPage />)}
          path="/app/competitions/:competitionId/submissions/:submissionId/feedback"
        />
        <Route element={inShell(<MyResultsPage />)} path="/app/results" />
        <Route element={inShell(<ReviewQueuePage />)} path="/app/review" />
        <Route element={inShell(<DashboardPage />)} path="*" />
      </Routes>
    </MembershipsProvider>
  );
}

function SessionGate() {
  const { data: session, error, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) {
    return <SessionPending />;
  }

  if (session) {
    const authenticatedRedirect = authenticatedLoginDestination(location.pathname);
    if (authenticatedRedirect) {
      return <Navigate replace to={authenticatedRedirect} />;
    }
    return <AuthenticatedRoutes />;
  }

  const unauthenticatedRedirect = unauthenticatedDestination(location.pathname);
  if (unauthenticatedRedirect) {
    return <Navigate replace to={unauthenticatedRedirect} />;
  }

  if (location.pathname === "/login") {
    return <LoginPage sessionError={Boolean(error)} />;
  }

  if (location.pathname === "/register") {
    return <RegisterPage />;
  }

  if (location.pathname === "/forgot-password") {
    return <ForgotPasswordPage />;
  }

  if (location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  return <LandingPage />;
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("React root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <SessionGate />
    </BrowserRouter>
  </StrictMode>,
);
