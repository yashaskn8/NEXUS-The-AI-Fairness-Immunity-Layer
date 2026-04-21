import type { ReactNode, CSSProperties } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface NexusButtonProps {
  variant?:    ButtonVariant;
  size?:       "sm" | "md" | "lg";
  children:    ReactNode;
  onClick?:    () => void;
  disabled?:   boolean;
  loading?:    boolean;
  fullWidth?:  boolean;
  style?:      CSSProperties;
  className?:  string;
  icon?:       ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, #2563EB, #8B5CF6)",
    color: "white",
    border: "none",
  },
  secondary: {
    background: "transparent",
    color: "var(--blue-400)",
    border: "1px solid var(--blue-500)",
  },
  ghost: {
    background: "transparent",
    color: "rgba(255,255,255,0.55)",
    border: "none",
  },
  danger: {
    background: "var(--red-subtle)",
    color: "var(--red)",
    border: "1px solid var(--red)",
  },
};

const SIZE_STYLES: Record<"sm" | "md" | "lg", CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: 12 },
  md: { padding: "10px 20px", fontSize: 14 },
  lg: { padding: "14px 28px", fontSize: 16 },
};

export function NexusButton({ variant = "primary", size = "md", children, onClick, disabled, loading, fullWidth, style, className, icon }: NexusButtonProps) {
  const vs = VARIANT_STYLES[variant];
  const ss = SIZE_STYLES[size];

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{
        ...vs,
        ...ss,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
    >
      {loading ? <Loader2 size={16} style={{ animation: "rotate-slow 1s linear infinite" }} /> : icon}
      {loading ? "Loading..." : children}
    </button>
  );
}
