interface SkeletonCardProps {
  width?: string;
  height?: string;
}

export function SkeletonCard({ width = "100%", height = "120px" }: SkeletonCardProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: "var(--radius)" }}
    />
  );
}
