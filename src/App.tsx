import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { demoMode, firebaseConfigured } from "./lib/firebase";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MyLearningPage = lazy(() => import("./pages/MyLearningPage"));
const NcertPage = lazy(() => import("./pages/NcertPage"));
const TopicPage = lazy(() => import("./pages/TopicPage"));
const ModulePage = lazy(() => import("./pages/ModulePage"));
const QuizPage = lazy(() => import("./pages/QuizPage"));
const ExamPrepPage = lazy(() => import("./pages/ExamPrepPage"));
const ProblemLabPage = lazy(() => import("./pages/ProblemLabPage"));
const ProblemSolvePage = lazy(() => import("./pages/ProblemSolvePage"));
const AiTutorPage = lazy(() => import("./pages/AiTutorPage"));
const RevisionPage = lazy(() => import("./pages/RevisionPage"));
const PlannerPage = lazy(() => import("./pages/PlannerPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const StudyTwinPage = lazy(() => import("./pages/StudyTwinPage"));
const ChallengesPage = lazy(() => import("./pages/ChallengesPage"));
const RewardsPage = lazy(() => import("./pages/RewardsPage"));
const DoubtsPage = lazy(() => import("./pages/DoubtsPage"));
const DoubtDetailPage = lazy(() => import("./pages/DoubtDetailPage"));
const CareersPage = lazy(() => import("./pages/CareersPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function FullPageSpinner() {
  return <div className="flex min-h-screen items-center justify-center"><Spinner label="Loading your learning journey..." /></div>;
}

function RequireAuth() {
  const { user, profile, loading, profileError } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (profileError) return <div className="p-6"><div className="card text-danger-500" role="alert">{profileError}</div></div>;
  if (!profile && location.pathname !== "/register") return <Navigate to="/register" replace state={{ completeProfile: true }} />;
  return <Outlet />;
}

function RequireAdmin() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, profile, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user && profile) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="card max-w-md text-center" role="alert">
            <p className="font-semibold">Something went wrong.</p>
            <p className="mt-1 text-sm text-ink-500">The page hit an unexpected error. Reloading usually fixes it.</p>
            <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  if (!firebaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-lg">
          <p className="font-semibold">Firebase is not configured.</p>
          <p className="mt-2 text-sm text-ink-700">Copy <code>.env.example</code> to <code>.env</code>, fill in your Firebase web app values, then restart the dev server. See README.md, section "Firebase setup".</p>
        </div>
      </div>
    );
  }
  return (
    <ErrorBoundary>
      {demoMode && <p className="fixed bottom-3 right-3 z-50 rounded-full bg-ink-900 px-3 py-1 text-xs text-white shadow">Demo mode: data stays in this browser</p>}
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/learn" element={<MyLearningPage />} />
              <Route path="/ncert" element={<NcertPage />} />
              <Route path="/ncert/:classLevel" element={<NcertPage />} />
              <Route path="/ncert/:classLevel/:subjectId" element={<NcertPage />} />
              <Route path="/learn/topic/:topicId" element={<TopicPage />} />
              <Route path="/learn/module/:moduleId" element={<ModulePage />} />
              <Route path="/quiz/:quizId" element={<QuizPage />} />
              <Route path="/exam/:track" element={<ExamPrepPage />} />
              <Route path="/problem-lab" element={<ProblemLabPage />} />
              <Route path="/problem-lab/:problemId" element={<ProblemSolvePage />} />
              <Route path="/ai-tutor" element={<AiTutorPage />} />
              <Route path="/revision" element={<RevisionPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/study-twin" element={<StudyTwinPage />} />
              <Route path="/challenges" element={<ChallengesPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/doubts" element={<DoubtsPage />} />
              <Route path="/doubts/:doubtId" element={<DoubtDetailPage />} />
              <Route path="/careers" element={<CareersPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
