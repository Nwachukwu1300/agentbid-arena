import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth';
import { LandingPage } from '@/pages/LandingPage';

// Every page but the landing page loads on first visit to it, so the charts and the
// agent builder stay out of the landing page's download
const LiveAuctionsPage = lazy(() => import('@/pages/LiveAuctionsPage').then((m) => ({ default: m.LiveAuctionsPage })));
const AuctionDetailPage = lazy(() => import('@/pages/AuctionDetailPage').then((m) => ({ default: m.AuctionDetailPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const AuthPage = lazy(() => import('@/pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const CreateAgentPage = lazy(() => import('@/pages/CreateAgentPage').then((m) => ({ default: m.CreateAgentPage })));
const AgentProfilePage = lazy(() => import('@/pages/AgentProfilePage').then((m) => ({ default: m.AgentProfilePage })));

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading page" />}>
      <Routes>
        {/* Public landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth routes */}
        <Route path="/auth" element={<AuthPage />} />

        {/* Public marketplace routes (no auth required, shows all agents) */}
        <Route path="/auctions" element={<LiveAuctionsPage />} />
        <Route path="/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        {/* Agent profiles are public; editing and the strategy are owner-only */}
        <Route path="/agents/:id" element={<AgentProfilePage />} />

        {/* Protected routes (require auth, user's own agents) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-agent"
          element={
            <ProtectedRoute>
              <CreateAgentPage />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}

export default App;
