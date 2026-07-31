import { lazy, Suspense, useEffect, useState } from "react";
import { SiteBackground } from "@/components/layout/SiteBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LandingPage } from "@/pages/LandingPage";

type Page = "landing" | "dapp";
type Theme = "dark" | "light";

const DappRoute = lazy(() => import("@/pages/DappRoute"));

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (nextPath: string) => {
    if (window.location.pathname === nextPath) return;
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return { path, navigate };
}

export default function App() {
  const { path, navigate } = useRoute();
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem("blobsafe-theme");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });
  const page: Page = path.startsWith("/app") || path === "/upload" ? "dapp" : "landing";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.add("theme-ready");
    window.localStorage.setItem("blobsafe-theme", theme);
  }, [theme]);

  return (
    <div className="min-h-screen overflow-hidden bg-[var(--obsidian-950)] text-frost">
      <SiteBackground />
      {page === "dapp" ? (
        <Suspense fallback={<RouteFallback />}>
          <DappRoute
            currentPath={path}
            theme={theme}
            onThemeChange={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            onNavigate={navigate}
          />
        </Suspense>
      ) : (
        <>
          <SiteHeader
            page="landing"
            theme={theme}
            onThemeChange={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            onNavigate={navigate}
          />
          <div className="route-frame">
          <LandingPage onNavigate={navigate} />
          </div>
        </>
      )}
    </div>
  );
}

function RouteFallback() {
  return (
    <>
      <div className="site-header sticky top-0 z-40 h-[74px] border-b backdrop-blur-xl" />
      <main className="relative z-10 mx-auto w-full max-w-[1760px] px-4 py-10 md:px-6 2xl:px-8">
        <div className="premium-surface flex min-h-[360px] items-center justify-center rounded-2xl px-6 py-16">
          <div className="text-center">
            <div className="skeleton-line mx-auto mb-4 h-10 w-10 rounded-xl" />
            <p className="font-display text-lg font-semibold text-frost">Opening vault</p>
            <p className="mt-2 text-sm text-frost-muted">Loading wallet and Shelby modules.</p>
          </div>
        </div>
      </main>
    </>
  );
}
