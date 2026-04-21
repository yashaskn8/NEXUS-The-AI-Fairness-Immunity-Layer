interface SkeletonBlockProps {
  width?: string;
  height?: string;
  borderRadius?: string;
}

export function SkeletonBlock({ width = "100%", height = "120px", borderRadius }: SkeletonBlockProps) {
  return (
    <div className="skeleton" style={{ width, height, borderRadius: borderRadius ?? "var(--radius-md)" }} />
  );
}

// Alias for backward compat
export const SkeletonCard = SkeletonBlock;
