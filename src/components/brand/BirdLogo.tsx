export function BirdLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/blobsafe-leaf-logo.png"
      alt=""
      aria-hidden="true"
      className={`${className} select-none rounded-lg object-cover`}
      draggable={false}
    />
  );
}
