export function CornerFrame({ className = "border-primary/50" }: { className?: string }) {
  return (
    <>
      <span className={`pointer-events-none absolute -left-px -top-px h-4 w-4 border-l border-t ${className}`} />
      <span className={`pointer-events-none absolute -right-px -top-px h-4 w-4 border-r border-t ${className}`} />
      <span className={`pointer-events-none absolute -bottom-px -left-px h-4 w-4 border-b border-l ${className}`} />
      <span className={`pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b border-r ${className}`} />
    </>
  );
}
