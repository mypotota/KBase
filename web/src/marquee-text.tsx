import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Sidebar labels truncate with an ellipsis. When a label overflows, hovering
// sweeps the full text through a marquee pass (speed scaled to the overflow
// distance) so long titles stay readable in place.
export function MarqueeText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState<CSSProperties | null>(null);
  return (
    <span
      className={cn("min-w-0 overflow-hidden", className)}
      onMouseEnter={() => {
        const el = ref.current;
        if (!el) return;
        const distance = el.scrollWidth - el.clientWidth;
        if (distance > 2)
          setRun({
            "--marquee-shift": `-${distance}px`,
            "--marquee-duration": `${Math.min(Math.max(distance / 30, 2.5), 7).toFixed(1)}s`,
          } as CSSProperties);
      }}
      onMouseLeave={() => setRun(null)}
    >
      <span
        ref={ref}
        className={cn(
          "block whitespace-nowrap text-left",
          run ? "marquee-run" : "truncate",
        )}
        style={run ?? undefined}
      >
        {children}
      </span>
    </span>
  );
}
