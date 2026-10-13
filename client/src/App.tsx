import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Loader as Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import { ForgotPassword, ResetPassword } from "@/pages/forgot-password";
// App pages load on demand so the sign-in screen and first paint stay small.
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Vouchers = lazy(() => import("@/pages/vouchers"));
const Batches = lazy(() => import("@/pages/batches"));
const Deposits = lazy(() => import("@/pages/deposits"));
const Companies = lazy(() => import("@/pages/settings/companies"));
const Names = lazy(() => import("@/pages/settings/names"));
const References = lazy(() => import("@/pages/settings/references"));
const Banks = lazy(() => import("@/pages/settings/banks"));
const BusinessSettings = lazy(() => import("@/pages/settings/business"));
const Users = lazy(() => import("@/pages/users"));
const Reports = lazy(() => import("@/pages/reports"));


function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(to, { replace: true });
  }, [setLocation, to]);

  return null;
}

/** Signed-out visit to an app page: sign in first, then come back to it. */
function RedirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  return <Redirect to={`/login?next=${encodeURIComponent(next)}`} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/"><Redirect to="/dashboard" /></Route>
      <Route path="/login"><Redirect to="/dashboard" /></Route>
      <Route path="/register"><Redirect to="/dashboard" /></Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/vouchers" component={Vouchers} />
      <Route path="/batches" component={Batches} />
      <Route path="/deposits" component={Deposits} />
      <Route path="/settings/companies" component={Companies} />
      <Route path="/settings/names" component={Names} />
      <Route path="/settings/references" component={References} />
      <Route path="/settings/banks" component={Banks} />
      <Route path="/settings/business" component={BusinessSettings} />
      <Route path="/settings/users" component={Users} />
      <Route path="/reports" component={Reports} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route component={RedirectToLogin} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-7xl">
              <Suspense
                fallback={
                  <div className="flex justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                }
              >
                <Router />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PublicRouter />;
  }

  // The password-reset link signs the user in; show the reset form, not the app.
  if (location === "/reset-password") {
    return <ResetPassword />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="voucherflow-theme">
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
