import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

interface MetricGaugeProps {
  value: number;
  threshold: number;
  label: string;
  severity: string;
}

const severityColor: Record<string, string> = {
  ok: "#10B981",
  none: "#10B981",
  low: "#3B82F6",
  medium: "#F59E0B",
  warning: "#F59E0B",
  high: "#F59E0B",
  critical: "#EF4444",
};

export function MetricGauge({ value, threshold, label, severity }: MetricGaugeProps) {
  const color = severityColor[severity] ?? "#3B82F6";
  const percentage = Math.min((value / Math.max(threshold, 0.01)) * 100, 120);

  const data = [
    { name: label, value: percentage, fill: color },
  ];

  return (
    <div style={{ textAlign: "center" }}>
      <ResponsiveContainer width="100%" height={160}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="90%"
          startAngle={225}
          endAngle={-45}
          data={data}
          barSize={10}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={5}
            background={{ fill: "rgba(255,255,255,0.05)" }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: -50 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 28,
            fontWeight: 700,
            color,
          }}
        >
          {value.toFixed(3)}
        </span>
        <br />
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
      </div>
    </div>
  );
}
