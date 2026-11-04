import type { CSSProperties } from "react";

/**
 * Pastel winter palette shared by the web scenes and the rasterised email
 * art, so it is spelled out as literal colours rather than CSS variables.
 */
export const WINTER = {
  ink: "#1f3550",
  pine: "#3f5b78",
  pineShade: "#344e6a",
  pineMid: "#6f8ba8",
  pineMidShade: "#62809e",
  pineFar: "#a6bcd2",
  mountainFar: "#e8f0f7",
  mountain: "#dde6f0",
  ridgeFar: "#d5e1ed",
  ridgeNear: "#c5d5e6",
  snow: "#f6f9fc",
  snowShade: "#e4ecf5",
  snowRim: "#d6e2ee",
  ice: "#d3e1ee",
  wall: "#4f6e8e",
  wallFront: "#5f7f9f",
  wallDark: "#3b5672",
  window: "#f4d184",
  deer: "#a88c76",
  deerDark: "#8b725f",
  deerLight: "#d3c1ae",
  antler: "#7a6452",
  berry: "#cf6b56",
  berryDark: "#b5553f",
  twig: "#4c6580",
  leaf: "#a9bfd5",
  leafShade: "#93abc4",
  skyTop: "#d3e2f0",
  skyBottom: "#ebf1f8",
} as const;

type Svg = { className?: string; style?: CSSProperties };

const PINE_TIERS: Array<[top: number, bottom: number, halfWidth: number]> = [
  [-100, -70, 13],
  [-86, -52, 20],
  [-70, -32, 26],
  [-54, -8, 32],
];

function tierPath(top: number, bottom: number, hw: number, half = false) {
  const h = bottom - top;
  const right = `M0 ${top}C${hw * 0.3} ${top + h * 0.5} ${hw * 0.62} ${bottom - h * 0.12} ${hw} ${bottom}Q${hw * 0.5} ${bottom - 4} 0 ${bottom - 1.5}`;
  if (half) return `${right}Z`;
  return `${right}Q${-hw * 0.5} ${bottom - 4} ${-hw} ${bottom}C${-hw * 0.62} ${bottom - h * 0.12} ${-hw * 0.3} ${top + h * 0.5} 0 ${top}Z`;
}

/** Tiered pine standing on (x, y), `h` units tall. */
export function Pine({
  x,
  y,
  h,
  color = WINTER.pine,
  shade = WINTER.pineShade,
  snow = true,
}: {
  x: number;
  y: number;
  h: number;
  color?: string;
  shade?: string;
  snow?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${h / 100})`}>
      <rect x={-3.5} y={-10} width={7} height={11} rx={1} fill={shade} />
      {PINE_TIERS.map(([top, bottom, hw]) => (
        <g key={top}>
          <path d={tierPath(top, bottom, hw)} fill={color} />
          <path d={tierPath(top, bottom, hw, true)} fill={shade} />
          {snow ? (
            <path
              d={`M${-hw * 0.82} ${bottom - 1.2}Q${-hw * 0.45} ${bottom - 5} ${-hw * 0.06} ${bottom - 2.8}`}
              stroke={WINTER.snow}
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
              opacity={0.92}
            />
          ) : null}
        </g>
      ))}
    </g>
  );
}

/** Narrow far-away tree, a single soft triangle. */
export function FarTree({
  x,
  y,
  h,
  color = WINTER.pineFar,
}: {
  x: number;
  y: number;
  h: number;
  color?: string;
}) {
  const w = h * 0.36;
  return (
    <path
      d={`M${x} ${y - h}C${x + w * 0.3} ${y - h * 0.5} ${x + w * 0.7} ${y - h * 0.12} ${x + w} ${y}H${x - w}C${x - w * 0.7} ${y - h * 0.12} ${x - w * 0.3} ${y - h * 0.5} ${x} ${y - h}Z`}
      fill={color}
    />
  );
}

/** Snowed-in cottage with lit windows; origin is the middle of its base. */
export function Cottage({
  x,
  y,
  scale = 1,
  animate = false,
}: {
  x: number;
  y: number;
  scale?: number;
  animate?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={animate ? "festive-smoke" : undefined} opacity={0.85}>
        <path
          d="M-8 -90c-9-8 6-14-1-23s7-15 0-24"
          stroke={WINTER.snow}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <rect x={-13} y={-82} width={10} height={20} fill={WINTER.wallDark} />
      <rect x={-15.5} y={-86} width={15} height={6} rx={3} fill={WINTER.snow} />

      <rect x={-52} y={-40} width={63} height={40} fill={WINTER.wall} />
      <path d="M11 -40 38 -64l26 24V0H11Z" fill={WINTER.wallFront} />
      <rect x={-52} y={-40} width={63} height={4} fill={WINTER.wallDark} opacity={0.55} />

      <rect x={-42} y={-30} width={13} height={15} rx={1.5} fill={WINTER.window} />
      <rect x={-20} y={-30} width={13} height={15} rx={1.5} fill={WINTER.window} />
      <rect x={30.5} y={-32} width={14} height={17} rx={1.5} fill={WINTER.window} />
      <path
        d="M-35.5 -30v15M-42 -22.5h13M-13.5 -30v15M-20 -22.5h13M37.5 -32v17M30.5 -23.5h14"
        stroke={WINTER.wallDark}
        strokeWidth={1.4}
      />

      <path
        d="M-28 -68H38L12 -37H-58Z"
        fill={WINTER.snow}
        stroke={WINTER.snow}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M-58 -37H12l-2.5 3H-55Z" fill={WINTER.snowRim} />
      <path
        d="M38 -68 68 -38"
        stroke={WINTER.snow}
        strokeWidth={6}
        strokeLinecap="round"
      />

      <path
        d="M-72 4C-52 -6-22-4 0-2c22-3 52-4 82 6v10H-72Z"
        fill={WINTER.snow}
      />
    </g>
  );
}

/** Small deer facing left; origin is between its hooves. */
export function Deer({
  x,
  y,
  scale = 1,
}: {
  x: number;
  y: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M-14 -30-15 0M-6 -30-5 0M18 -30 17 0M25 -31 27 0"
        stroke={WINTER.deerDark}
        strokeWidth={3.8}
        strokeLinecap="round"
      />
      <path
        d="M-20 -44c4-8 38-10 48-2 6 5 5 16-2 19-12 3-34 3-42 0-6-3-7-11-4-17Z"
        fill={WINTER.deer}
      />
      <path
        d="M-14 -29c10 3 28 3 38 0-4 3-30 5-38 0Z"
        fill={WINTER.deerLight}
      />
      <path d="M28 -46c5-2 7 2 4 5Z" fill={WINTER.snow} />
      <path
        d="M-19 -42c-2-8-4-16-6-22l10-2c2 8 4 16 6 20Z"
        fill={WINTER.deer}
      />
      <path
        d="M-20 -44c-2 4-1 10 3 14 1-6 1-10-1-15Z"
        fill={WINTER.deerLight}
        opacity={0.8}
      />
      <path
        d="M-26 -70c6-3 13 0 13 6-1 3-5 4-9 4l-11 2c-4 0-5-4-2-6Z"
        fill={WINTER.deer}
      />
      <path
        d="M-16 -69c6-5 10-3 7 1-2 2-5 2-7-1Z"
        fill={WINTER.deerDark}
      />
      <circle cx={-35.5} cy={-60.5} r={1.8} fill="#5b4a3f" />
      <circle cx={-24} cy={-66} r={1.1} fill="#3d3029" />
      <path
        d="M-22 -71c-2-7-5-11-9-15M-25 -78c-4-1-7 0-9 2M-28 -83c0-4 2-7 4-9M-18 -71c2-7 5-12 9-15M-15 -79c3-1 6 0 8 2M-12 -83c0-4-2-7-4-9"
        stroke={WINTER.antler}
        strokeWidth={1.9}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function Berry({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={WINTER.berry} />
      <circle
        cx={cx - r * 0.35}
        cy={cy - r * 0.35}
        r={r * 0.3}
        fill="#ffffff"
        opacity={0.45}
      />
    </g>
  );
}

function HareEar({
  at,
  tilt,
}: {
  at: [number, number];
  tilt: number;
}) {
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${tilt})`}>
      <path
        d="M0 0C-4-12-5-42-2-64C0-72 5-72 7-64C10-42 6-12 0 0Z"
        fill={WINTER.deer}
      />
      <path
        d="M1-14C-1-22-1-44 2-56C3.5-60 5.5-56 6-44C6.5-28 4-14 1-14Z"
        fill={WINTER.deerLight}
      />
      <ellipse cx={2.5} cy={-62} rx={2.4} ry={5} fill={WINTER.deerDark} />
    </g>
  );
}

/** Sitting hare; origin is between its paws. Faces left unless `flip`. */
export function Hare({
  x,
  y,
  scale = 1,
  flip = false,
}: {
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <path
        d="M-14 0h7M8 0h9"
        stroke={WINTER.deerDark}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <ellipse cx={11} cy={-15} rx={14} ry={16} fill={WINTER.deer} />
      <ellipse cx={-3} cy={-16} rx={16} ry={11} fill={WINTER.deer} />
      <ellipse cx={-5} cy={-11} rx={11} ry={6} fill={WINTER.deerLight} />
      <circle cx={22} cy={-18} r={4.6} fill={WINTER.snow} />
      <HareEar at={[-10, -28]} tilt={18} />
      <HareEar at={[-18, -26]} tilt={-8} />
      <ellipse cx={-16} cy={-26} rx={9} ry={8} fill={WINTER.deer} />
      <ellipse cx={-23} cy={-23} rx={5.5} ry={4.5} fill={WINTER.deer} />
      <ellipse cx={-13} cy={-24} rx={3.5} ry={2.6} fill={WINTER.deerLight} opacity={0.8} />
      <circle cx={-18} cy={-28} r={1.55} fill="#3d3029" />
      <circle cx={-27} cy={-22} r={1.15} fill={WINTER.deerDark} />
    </g>
  );
}

/** Two crossed twigs with berries — the small divider under titles. */
export function BerrySprig({ className }: Svg) {
  return (
    <svg
      viewBox="0 0 72 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g stroke={WINTER.twig} strokeWidth={1.5} strokeLinecap="round">
        <path d="M46 19C36 15 24 12 12 12" />
        <path d="M24 13c-3-3-6-5-10-6" />
        <path d="M26 19c10-4 22-7 34-7" />
        <path d="M48 13c3-3 6-5 10-6" />
      </g>
      <Berry cx={9} cy={12} r={3.2} />
      <Berry cx={12.5} cy={6.5} r={2.7} />
      <Berry cx={14} cy={16} r={2.4} />
      <Berry cx={63} cy={12} r={3.2} />
      <Berry cx={59.5} cy={6.5} r={2.7} />
      <Berry cx={58} cy={16} r={2.4} />
    </svg>
  );
}

/** Tall bare branch with berry clusters for the bottom corners. */
export function BerryBranch({ className, style }: Svg) {
  return (
    <svg
      viewBox="0 0 120 200"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g stroke={WINTER.twig} strokeWidth={2.4} strokeLinecap="round">
        <path d="M38 200c2-40 10-84 32-132" />
        <path d="M44 150c-14-14-22-34-26-58" />
        <path d="M52 118c14-10 30-18 48-22" />
        <path d="M62 86c-8-12-12-24-12-40" />
        <path d="M30 110c-8-4-14-10-18-18" />
      </g>
      <Berry cx={72} cy={62} r={5.5} />
      <Berry cx={80} cy={70} r={5} />
      <Berry cx={68} cy={74} r={4.5} />
      <Berry cx={17} cy={86} r={5.5} />
      <Berry cx={11} cy={95} r={4.8} />
      <Berry cx={103} cy={93} r={5.2} />
      <Berry cx={100} cy={104} r={4.6} />
      <Berry cx={50} cy={40} r={5} />
      <Berry cx={57} cy={46} r={4.4} />
    </svg>
  );
}

/** Frosty leaves tucked behind the berry branches. */
export function FrostLeaves({ className }: Svg) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M60 120C50 88 30 64 8 52c18 20 30 44 40 68Z" fill={WINTER.leaf} />
      <path d="M62 120C62 86 70 54 92 30 86 58 80 88 72 120Z" fill={WINTER.leafShade} />
      <path d="M58 120C46 96 40 70 42 40c10 26 16 52 22 80Z" fill={WINTER.leaf} />
      <path d="M66 120c10-20 26-38 50-50-14 18-26 34-38 50Z" fill={WINTER.leaf} />
    </svg>
  );
}

/** Wrapped present for the unwrap card. */
export function GiftBox({ className }: Svg) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx={60} cy={109} rx={42} ry={5} fill={WINTER.snowShade} />
      <rect x={22} y={52} width={76} height={56} rx={7} fill="#5b7a9a" />
      <path d="M60 52h31a7 7 0 0 1 7 7v42a7 7 0 0 1-7 7H60Z" fill="#4f6d8c" />
      <rect x={15} y={38} width={90} height={19} rx={6} fill="#6a88a7" />
      <path d="M60 38h39a6 6 0 0 1 6 6v7a6 6 0 0 1-6 6H60Z" fill="#5d7b9b" />
      <path
        d="M19 41c8-4 16 1 24-2s14-2 22 1 18-1 26-2 10 1 12 3"
        stroke={WINTER.snow}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <rect x={53} y={38} width={14} height={70} fill="#eef4fa" />
      <rect x={60} y={38} width={7} height={70} fill="#dde7f1" />
      <path d="M60 37C48 16 30 22 34 32c3 7 16 7 26 5Z" fill={WINTER.berry} />
      <path d="M60 37c12-21 30-15 26-5-3 7-16 7-26 5Z" fill={WINTER.berryDark} />
      <path d="M57 38c-4 8-8 14-14 18M63 38c4 8 8 14 14 18" stroke={WINTER.berry} strokeWidth={4} strokeLinecap="round" />
      <circle cx={60} cy={37} r={6.5} fill={WINTER.berryDark} />
      <circle cx={58} cy={35} r={2} fill="#ffffff" opacity={0.4} />
    </svg>
  );
}
