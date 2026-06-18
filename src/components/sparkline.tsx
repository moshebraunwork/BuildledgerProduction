import { cn } from "@/lib/utils";

// Tiny inline SVG sparkline — pure, server-renderable. Draws a smooth-ish line
// (and optional filled area) from a series of numbers, normalised to the box.
export function Sparkline({
  data,
  className,
  stroke = "currentColor",
  fill = false,
  width = 100,
  height = 28,
  strokeWidth = 1.5,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  if (!data || data.length === 0) return null;
  const pts = data.length === 1 ? [data[0], data[0]] : data;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const pad = strokeWidth;
  const stepX = (width - pad * 2) / (pts.length - 1);

  const coords = pts.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / range);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden
    >
      {fill && <path d={area} fill={stroke} opacity={0.12} />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
