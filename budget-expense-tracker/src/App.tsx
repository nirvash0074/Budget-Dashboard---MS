import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { queryClient } from "@/lib/query-client";
import { AppShell } from "@/components/app-shell";
import { NotFoundPage } from "@/pages/not-found";
import { routes } from "@/routes";

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <ConfirmDialogProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AppShell />}>
                  {routes.map((r) =>
                    r.path === "/" ? (
                      <Route key={r.path} index element={r.element} />
                    ) : (
                      <Route key={r.path} path={r.path} element={r.element} />
                    ),
                  )}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ConfirmDialogProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
