import { DappProviders } from "@/DappProviders";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { DappPage } from "@/pages/DappPage";

export default function DappRoute({
  currentPath,
  theme,
  onThemeChange,
  onNavigate,
}: {
  currentPath: string;
  theme: "dark" | "light";
  onThemeChange: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <DappProviders>
      <SiteHeader
        page="dapp"
        theme={theme}
        onThemeChange={onThemeChange}
        onNavigate={onNavigate}
        showWallet
      />
      <div className="route-frame">
        <DappPage currentPath={currentPath} onNavigate={onNavigate} />
      </div>
    </DappProviders>
  );
}
