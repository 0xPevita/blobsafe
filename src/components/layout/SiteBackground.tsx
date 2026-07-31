export function SiteBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className="site-grid absolute inset-0" />
      <div className="site-vertical-line absolute inset-y-0 left-[18%] w-px" />
      <div className="site-vertical-line subtle absolute inset-y-0 right-[16%] w-px" />
      <div className="site-top-line absolute inset-x-0 top-0 h-px" />
      <div className="site-sweep absolute left-0 top-24 h-[1px] w-full origin-left animate-signal-sweep" />
      <div className="site-vignette absolute inset-0" />
    </div>
  );
}
