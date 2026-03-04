import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import IngestPage from "./pages/IngestPage";
import VariantsPage from "./pages/VariantsPage";
import RenderPage from "./pages/RenderPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import MotionGeneratorPage from "./pages/MotionGeneratorPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/assets/new" element={<IngestPage />} />
                <Route path="/assets/:id/variants" element={<VariantsPage />} />
                <Route path="/assets/:id/render" element={<RenderPage />} />
                <Route path="/motion" element={<MotionGeneratorPage />} />
              </Route>
            </Route>

            {/* Legacy redirects */}
            <Route path="/workspace" element={<Navigate to="/assets/new" replace />} />
            <Route path="/workspace/:id" element={<Navigate to="/assets/new" replace />} />
            <Route path="/ingest" element={<Navigate to="/assets/new" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
