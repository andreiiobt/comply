import { cn } from "@/lib/utils";

const BODY_REGIONS = [
  { id: "head", label: "Head", d: "M88,8 C78,8 70,16 68,26 L66,38 C66,48 74,56 84,58 L88,60 L92,58 C102,56 110,48 110,38 L108,26 C106,16 98,8 88,8Z" },
  { id: "torso", label: "Torso", d: "M72,62 L66,68 L62,100 L64,140 L72,150 L88,154 L104,150 L112,140 L114,100 L110,68 L104,62 L92,58 L88,60 L84,58Z" },
  { id: "left_upper_arm", label: "Left Upper Arm", d: "M62,68 L54,72 L46,96 L48,108 L56,112 L62,100Z" },
  { id: "left_forearm", label: "Left Forearm & Hand", d: "M56,112 L48,108 L38,134 L30,158 L34,164 L44,162 L52,140Z" },
  { id: "right_upper_arm", label: "Right Upper Arm", d: "M114,68 L122,72 L130,96 L128,108 L120,112 L114,100Z" },
  { id: "right_forearm", label: "Right Forearm & Hand", d: "M120,112 L128,108 L138,134 L146,158 L142,164 L132,162 L124,140Z" },
  { id: "left_upper_leg", label: "Left Upper Leg", d: "M72,150 L88,154 L88,156 L84,210 L76,216 L66,210 L64,140Z" },
  { id: "left_lower_leg", label: "Left Lower Leg & Foot", d: "M66,210 L76,216 L84,210 L82,260 L78,286 L72,292 L64,288 L66,260Z" },
  { id: "right_upper_leg", label: "Right Upper Leg", d: "M104,150 L88,154 L88,156 L92,210 L100,216 L110,210 L112,140Z" },
  { id: "right_lower_leg", label: "Right Lower Leg & Foot", d: "M110,210 L100,216 L92,210 L94,260 L98,286 L104,292 L112,288 L110,260Z" },
];

export const BODY_REGION_LABELS: Record<string, string> = Object.fromEntries(
  BODY_REGIONS.map((r) => [r.id, r.label])
);

interface BodyMapProps {
  selectedParts: string[];
  onToggle?: (part: string) => void;
  readOnly?: boolean;
  className?: string;
}

export default function BodyMap({ selectedParts, onToggle, readOnly = false, className }: BodyMapProps) {
  return (
    <div className={cn("flex justify-center", className)}>
      <svg
        viewBox="20 0 136 300"
        className="w-full max-w-[200px] h-auto"
        aria-label="Body map"
      >
        {BODY_REGIONS.map((region) => {
          const isSelected = selectedParts.includes(region.id);
          return (
            <path
              key={region.id}
              d={region.d}
              className={cn(
                "transition-colors duration-150 stroke-border",
                isSelected
                  ? "fill-destructive/30 stroke-destructive"
                  : "fill-muted/40 stroke-muted-foreground/30",
                !readOnly && "cursor-pointer hover:fill-destructive/15 active:scale-[0.97]"
              )}
              strokeWidth={1.2}
              strokeLinejoin="round"
              onClick={() => !readOnly && onToggle?.(region.id)}
              role={readOnly ? undefined : "button"}
              aria-label={region.label}
              aria-pressed={isSelected}
            >
              <title>{region.label}</title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}
