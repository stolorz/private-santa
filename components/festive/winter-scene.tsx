import type { CSSProperties } from "react";
import { Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BerryBranch,
  Cottage,
  Deer,
  FarTree,
  FrostLeaves,
  Hare,
  Pine,
  WINTER,
} from "@/components/festive/festive-motifs";

const FAR_TREES: Array<[x: number, h: number]> = [
  [236, 26], [252, 34], [268, 24], [284, 38], [300, 28], [318, 22],
  [640, 30], [656, 40], [672, 26], [690, 36], [706, 24], [724, 30],
  [872, 22], [890, 32], [908, 26],
  [1240, 28], [1256, 38], [1274, 30], [1290, 42], [1308, 26], [1326, 34],
];

const EDGE_PINES: Array<[x: number, y: number, h: number]> = [
  [64, 356, 200],
  [140, 364, 150],
  [16, 372, 120],
  [212, 372, 96],
  [372, 360, 84],
  [410, 352, 116],
  [1178, 350, 120],
  [1214, 360, 86],
  [1390, 374, 92],
  [1452, 366, 150],
  [1528, 356, 210],
  [1590, 372, 120],
];

const SKY_FLAKES: Array<[x: number, y: number, size: number]> = [
  [120, 60, 26], [330, 110, 18], [760, 40, 22], [1010, 96, 16],
  [1250, 50, 28], [1480, 120, 18], [560, 150, 14],
];

/**
 * Horizon band: mountains, a forest line, the cottage and the deer, ending
 * in flat snow so the page below can continue in the same colour.
 */
export function WinterLandscape({
  className,
  style,
  width,
  height,
  sky = false,
  snow = WINTER.snow,
  viewBox = "0 0 1600 400",
  preserveAspectRatio = "xMidYMax slice",
  animate = true,
}: {
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
  /** Paint the sky gradient and a few crystals; the web page draws its own. */
  sky?: boolean;
  snow?: string;
  viewBox?: string;
  preserveAspectRatio?: string;
  animate?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {sky ? (
        <>
          <defs>
            <linearGradient id="winter-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={WINTER.skyTop} />
              <stop offset="1" stopColor={WINTER.skyBottom} />
            </linearGradient>
          </defs>
          <rect x={-400} y={-400} width={2400} height={800} fill="url(#winter-sky)" />
          {SKY_FLAKES.map(([x, y, size]) => (
            <Snowflake
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={size}
              height={size}
              color="#ffffff"
              strokeWidth={1.6}
            />
          ))}
        </>
      ) : null}

      <path
        d="M0 236C90 214 170 196 260 204c80 7 120-26 210-34s150 30 230 36 140-30 230-38 150 24 230 30 140-26 230-32 150 20 210 28V400H0Z"
        fill={WINTER.ridgeFar}
      />
      <path
        d="M0 268c120-18 200-30 300-22s170-20 260-24 160 28 260 30 170-26 260-30 160 24 250 26 190-12 270-8V400H0Z"
        fill={WINTER.ridgeNear}
      />
      {FAR_TREES.map(([x, h]) => (
        <FarTree key={x} x={x} y={300} h={h} />
      ))}
      <path
        d="M0 300c160-16 300-12 440-4s260-6 380-4 260 10 400 4 260-8 380 0V400H0Z"
        fill={WINTER.snowShade}
      />

      <Pine x={452} y={312} h={66} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
      <Pine x={478} y={316} h={50} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
      <Pine x={1236} y={308} h={72} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
      <Pine x={1262} y={312} h={54} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
      <Cottage x={566} y={318} scale={1.1} animate={animate} />

      <path
        d="M0 325c200-14 380 2 560 6s340-10 520-6 340-8 520 0V400H0Z"
        fill={WINTER.snowRim}
      />
      <path
        d="M0 330c200-14 380 2 560 6s340-10 520-6 340-8 520 0V400H0Z"
        fill={snow}
      />
      <Deer x={1010} y={334} scale={0.62} />

      {EDGE_PINES.map(([x, y, h]) => (
        <g key={`${x}-${y}`}>
          <Pine x={x} y={y} h={h} />
          <ellipse cx={x} cy={y + 2} rx={h * 0.34} ry={h * 0.05} fill={snow} />
        </g>
      ))}
    </svg>
  );
}

type SideVariant = "cottage" | "deer";

function snowCap(d: string, opacity = 0.78) {
  return <path d={d} fill={WINTER.snow} opacity={opacity} />;
}

/** Furthest, palest peaks — sit in the top corner, with sky above so they are not clipped. */
function FarMountains() {
  return (
    <svg
      viewBox="0 0 520 400"
      preserveAspectRatio="xMinYMin meet"
      fill="none"
      className="absolute top-0 left-0 h-[70vh] w-[128%] overflow-visible"
    >
      <path
        d="M-20 400C10 300 40 220 70 200 110 168 150 230 190 270 230 190 280 120 340 148 400 176 450 260 540 400Z"
        fill={WINTER.mountainFar}
      />
      {snowCap(
        "M68 204c10-14 18-28 26-30 8-2 20 12 32 30-10-4-16 6-24 0-8 8-16-2-24 4-4-6-6-4-10-4Z",
        0.55,
      )}
      {snowCap(
        "M328 156c14-18 24-36 34-38 10-2 26 16 40 38-12-6-20 8-30 0-10 10-20-2-30 6-4-8-8-6-14-6Z",
        0.7,
      )}
    </svg>
  );
}

/** Closer range, a little darker, overlapping the far peaks. */
function MidMountains() {
  return (
    <svg
      viewBox="0 0 520 360"
      preserveAspectRatio="xMinYMin meet"
      fill="none"
      className="absolute top-[12%] left-0 h-[58vh] w-[118%] overflow-visible"
    >
      <path
        d="M-24 360C30 260 90 180 150 192 210 204 250 130 320 152 400 176 470 260 560 360Z"
        fill={WINTER.mountain}
      />
      <path
        d="M-24 360C50 280 130 210 210 228 290 246 360 180 430 220 490 254 540 320 560 360Z"
        fill={WINTER.ridgeFar}
      />
      {snowCap(
        "M306 160c12-16 20-32 28-34 8-2 22 14 34 34-10-5-16 8-26 0-10 10-18-2-26 6-4-8-6-6-10-6Z",
      )}
      <FarTree x={110} y={250} h={32} />
      <FarTree x={132} y={256} h={24} />
      <FarTree x={152} y={252} h={36} />
      <FarTree x={380} y={268} h={28} />
      <FarTree x={400} y={274} h={22} />
    </svg>
  );
}

const GROUND_FAR_TREES: Record<SideVariant, Array<[x: number, y: number, h: number]>> = {
  cottage: [
    [150, 148, 36], [170, 152, 26], [190, 156, 42], [210, 162, 30],
    [280, 198, 32], [300, 206, 24], [400, 268, 22], [418, 276, 16],
  ],
  deer: [
    [158, 152, 32], [178, 156, 40], [198, 160, 26], [218, 166, 34],
    [320, 230, 26], [338, 240, 18],
  ],
};

const GROUND_PINES: Record<SideVariant, Array<[x: number, y: number, h: number]>> = {
  cottage: [
    [58, 560, 300],
    [150, 572, 200],
    [10, 588, 170],
    [430, 618, 56],
  ],
  deer: [
    [52, 564, 280],
    [144, 576, 196],
    [6, 590, 164],
    [214, 582, 88],
  ],
};

/**
 * Near ground: hills, the building or the deer, then animals in front.
 * Anchored to the bottom of the side so plants and critters stay on the snow.
 */
function SideGround({ variant }: { variant: SideVariant }) {
  const cottage = variant === "cottage";
  return (
    <svg
      viewBox="0 0 500 640"
      preserveAspectRatio="xMinYMax meet"
      fill="none"
      className="absolute bottom-0 left-0 h-[min(78vh,46rem)] w-full overflow-visible"
    >
      <path
        d="M0 120C90 78 180 98 280 152s170 92 220 128V640H0Z"
        fill={WINTER.ridgeFar}
      />
      <path
        d="M0 150C110 116 220 150 340 210s150 78 160 108V640H0Z"
        fill={WINTER.ridgeNear}
      />
      {GROUND_FAR_TREES[variant].map(([x, y, h]) => (
        <FarTree key={x} x={x} y={y} h={h} />
      ))}
      <path
        d="M0 250C140 220 280 260 500 370V640H0Z"
        fill={WINTER.snowShade}
      />
      {cottage ? (
        <>
          <Pine x={198} y={388} h={78} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
          <Pine x={338} y={398} h={58} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
          <Cottage x={248} y={408} scale={1.22} animate />
        </>
      ) : (
        <>
          <Pine x={300} y={378} h={80} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
          <Pine x={328} y={388} h={58} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
        </>
      )}
      <path
        d="M0 468C160 446 320 500 500 582V640H0Z"
        fill={WINTER.snowRim}
      />
      <path
        d="M0 476C160 454 320 508 500 590V640H0Z"
        fill={WINTER.snow}
      />
      {cottage ? (
        <Hare x={348} y={512} scale={0.95} flip />
      ) : (
        <>
          <path
            d="M292 568c58-14 158-14 206 2-46 12-156 14-206-2Z"
            fill={WINTER.ice}
          />
          <path
            d="M318 566h52M408 562h40"
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.85}
          />
          <g transform="translate(278 508) scale(-1 1)">
            <Deer x={0} y={0} scale={1.05} />
          </g>
        </>
      )}
      {GROUND_PINES[variant].map(([x, y, h]) => (
        <g key={`${x}-${y}`}>
          <Pine x={x} y={y} h={h} />
          <ellipse cx={x} cy={y + 2} rx={h * 0.34} ry={h * 0.05} fill={WINTER.snow} />
        </g>
      ))}
    </svg>
  );
}

function SideFrame({
  variant,
  side,
  contained = false,
}: {
  variant: SideVariant;
  side: "left" | "right";
  contained?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none inset-y-0 z-0 hidden w-[min(42rem,calc(50vw-13.5rem))] lg:block",
        contained ? "absolute" : "fixed",
        side === "left" ? "left-0" : "right-0 -scale-x-100",
      )}
    >
      <div className="absolute inset-0 [mask-image:linear-gradient(to_right,#000_0%,#000_56%,transparent_94%)]">
        <FarMountains />
        <MidMountains />
        <SideGround variant={variant} />
      </div>
      <FrostLeaves className="absolute bottom-0 -left-[2%] aspect-square w-[22%] max-w-28" />
      <BerryBranch
        className={cn(
          "festive-sway absolute bottom-0 aspect-[3/5] w-[22%] max-w-28",
          side === "left" ? "left-[5%]" : "left-[3%] w-[20%] max-w-26",
        )}
        style={side === "right" ? { animationDelay: "-3s" } : undefined}
      />
    </div>
  );
}

/**
 * Wide-screen frame: faded mountains in the top corners, then nearer hills,
 * the cottage and trees, animals, and berry branches on the snow.
 */
export function WinterSides({ contained = false }: { contained?: boolean }) {
  return (
    <>
      <SideFrame variant="cottage" side="left" contained={contained} />
      <SideFrame variant="deer" side="right" contained={contained} />
    </>
  );
}

function MobileCorner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 90"
      preserveAspectRatio="xMinYMin meet"
      fill="none"
      className={className}
    >
      <path
        d="M-20 90C10 48 28 18 52 12 82 4 104 44 128 78 140 40 152 28 170 90Z"
        fill={WINTER.mountainFar}
      />
      <path
        d="M-20 90C18 58 48 38 80 46 112 54 136 78 170 90Z"
        fill={WINTER.ridgeFar}
      />
      {snowCap(
        "M50 16c8-10 14-20 20-21 6-1 16 10 24 21-8-4-12 4-18 0-6 6-12-2-18 4-2-4-5-4-8-4Z",
        0.7,
      )}
    </svg>
  );
}

/** Pale mountain peeks in the top corners on small screens. */
export function WinterMobileCorners() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-24 lg:hidden"
    >
      <MobileCorner className="absolute top-0 -left-2 h-20 w-32" />
      <MobileCorner className="absolute top-0 -right-2 h-20 w-32 -scale-x-100" />
    </div>
  );
}

/** Snow drifts, a frozen pond and berry branches closing the page. */
export function WinterForeground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative mt-6 h-[clamp(140px,22vh,220px)] w-full shrink-0",
        className,
      )}
    >
      <svg
        viewBox="0 0 1600 220"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
        className="absolute inset-0 size-full"
      >
        <path
          d="M0 120c220-28 420-2 640-10s360-38 600-18c180 16 280 4 360 8V220H0Z"
          fill={WINTER.snowShade}
        />
        <Pine x={1180} y={108} h={58} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
        <Pine x={1206} y={112} h={44} color={WINTER.pineMid} shade={WINTER.pineMidShade} snow={false} />
        <FarTree x={360} y={112} h={34} />
        <FarTree x={378} y={114} h={26} />
        <path
          d="M760 158c50-10 120-10 170-2-40 10-130 10-170 2Z"
          fill={WINTER.ice}
        />
        <path
          d="M790 155h50M860 152h40"
          stroke="#ffffff"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.85}
        />
        <path
          d="M0 161c180-32 360-10 520 2s380-12 560-2 340-20 520-10V220H0Z"
          fill={WINTER.snowRim}
        />
        <path
          d="M0 166c180-32 360-10 520 2s380-12 560-2 340-20 520-10V220H0Z"
          fill={WINTER.snow}
        />
        <Cottage x={660} y={168} scale={0.72} animate />
        <Deer x={980} y={176} scale={0.58} />
        <Pine x={1410} y={178} h={150} />
        <Pine x={1478} y={186} h={108} />
        <ellipse cx={1440} cy={184} rx={80} ry={8} fill={WINTER.snow} />
      </svg>
      <FrostLeaves className="absolute bottom-0 -left-4 h-24 w-24 sm:left-0 sm:h-36 sm:w-36" />
      <BerryBranch className="festive-sway absolute bottom-0 left-2 h-36 w-24 sm:left-12 sm:h-52 sm:w-32" />
      <BerryBranch
        className="festive-sway absolute right-1 bottom-0 h-32 w-20 -scale-x-100 sm:right-14 sm:h-44 sm:w-28"
        style={{ animationDelay: "-3s" }}
      />
    </div>
  );
}
