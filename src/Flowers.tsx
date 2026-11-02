import { memo, useRef, type CSSProperties } from "react";
import type { FlowerEffect } from "./Appearance.js";
import { useNaturalMotion } from "./naturalMotion.js";

// 48 flower positions (scattered across the viewport)
const SCATTER: Array<[number, number]> = Array.from({ length: 48 }, (_, i) => {
  const seed = (salt: number) => {
    const n = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return (n - Math.floor(n)) * 100;
  };
  return [seed(1), seed(2)];
});

// Star positions for the Moon atmosphere (used only when kind === 'moon')
const STARS: Array<{ x: number; y: number; s: number }> = [
  { x: 5, y: 9, s: 2.0 },
  { x: 16, y: 26, s: 2.8 },
  { x: 27, y: 43, s: 3.6 },
  { x: 38, y: 60, s: 2.0 },
  { x: 49, y: 77, s: 2.8 },
  { x: 60, y: 94, s: 3.6 },
  { x: 71, y: 11, s: 2.0 },
  { x: 82, y: 28, s: 2.8 },
  { x: 93, y: 45, s: 3.6 },
  { x: 4, y: 62, s: 2.0 },
  { x: 15, y: 79, s: 2.8 },
  { x: 26, y: 96, s: 3.6 },
  { x: 37, y: 13, s: 2.0 },
  { x: 48, y: 30, s: 2.8 },
  { x: 59, y: 47, s: 3.6 },
  { x: 70, y: 64, s: 2.0 },
  { x: 81, y: 81, s: 2.8 },
  { x: 92, y: 98, s: 3.6 },
  { x: 3, y: 15, s: 2.0 },
  { x: 14, y: 32, s: 3.0 },
  { x: 25, y: 49, s: 3.6 },
  { x: 36, y: 66, s: 2.0 },
  { x: 47, y: 83, s: 3.6 },
  { x: 58, y: 0, s: 4.0 },
];

export const Flowers = memo(function Flowers({
  effect,
  suspended = false,
}: {
  effect: Exclude<FlowerEffect, "none">;
  suspended?: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const kind = effect.startsWith("moon-")
    ? "moon"
    : effect.startsWith("leaves-")
      ? "leaves"
      : "flowers";
  useNaturalMotion(layer, effect.endsWith("falling"), suspended);

  // Render starfield for Moon mode
  const stars =
    kind === "moon" ? (
      <div
        className="moon-stars"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      >
        {STARS.map((star, i) => (
          <svg
            key={i}
            className="star"
            viewBox="-1.2 -1.2 2.4 2.4"
            focusable="false"
            style={
              {
                position: "absolute",
                width: "var(--s)",
                height: "var(--s)",
                left: `${star.x}%`,
                top: `${star.y}%`,
                "--s": `${star.s}px`,
                "--c": "#f6df9d", // warm bright star colour
              } as CSSProperties
            }
          >
            <path
              d="M0,-1 L1,0 L0,0.7 L-1,0 L0,-0.7 Z"
              fill="var(--c)"
              stroke="#67818f"
              strokeWidth="0.2"
            />
          </svg>
        ))}
      </div>
    ) : null;

  return (
    <div
      ref={layer}
      className="flower-layer natural-flowers"
      aria-hidden="true"
      data-kind={kind}
      data-falling={effect.endsWith("falling")}
    >
      {SCATTER.map(([x, y], i) => (
        <svg
          key={i}
          className="flower"
          viewBox={kind === "flowers" ? "-1.7 -1.7 3.4 3.4" : "0 0 40 40"}
          focusable="false"
          style={
            {
              "--x": `${x}%`,
              "--size": `${28 + (Math.floor(i / 2) % 4) * 4}px`,
              "--duration": `${24 + (i % 7) * 3}s`,
              "--delay": `${-i * 7}s`,
              "--rest": `${y}vh`,
            } as CSSProperties
          }
        >
          {kind === "flowers" ? (
            <>
              <defs>
                <radialGradient id={`petal-${i}`} cx="35%" cy="20%" r="85%">
                  <stop offset="0" stopColor="#fffef1" />
                  <stop offset=".55" stopColor="#f4e8bf" />
                  <stop offset="1" stopColor="#c9b882" />
                </radialGradient>
              </defs>
              {[0, 72, 144, 216, 288].map((angle) => (
                <g key={angle} transform={`rotate(${angle})`}>
                  <path
                    d="M0 .1 C-.22 -.12,-.58 -.42,-.47 -.82 C-.36 -1.2,.32 -1.25,.47 -.84 C.61 -.45,.23 -.08,0 .1Z"
                    fill={`url(#petal-${i})`}
                    stroke="#d4c392"
                    strokeWidth=".018"
                  />
                  <path
                    d="M-.36 -.82 C-.2 -1.06,.22 -1.08,.36 -.86"
                    fill="none"
                    stroke="#fffef6"
                    strokeWidth=".055"
                    opacity=".85"
                  />
                  <path
                    d="M0 -.08 Q-.08 -.45,.06 -.82"
                    fill="none"
                    stroke="#c4ad78"
                    strokeWidth=".02"
                    opacity=".4"
                  />
                </g>
              ))}
              <ellipse cx="0" cy="0" rx=".145" ry=".105" fill="#b89042" />
            </>
          ) : kind === "moon" ? (
            <>
              <path
                d={
                  Math.floor(i / 2) % 4 === 0
                    ? "M29 4C9 0 0 22 16 33C24 39 34 34 37 27C16 32 10 13 29 4Z"
                    : "M20 3L24 15L37 20L24 24L20 37L16 24L3 20L16 16Z"
                }
                fill={Math.floor(i / 2) % 4 === 0 ? "#f6df9d" : "#edf4ef"}
                stroke="#67818f"
                strokeWidth="1"
              />
            </>
          ) : (
            <>
              <defs>
                <linearGradient id={`leaf-shade-${i}`} x1="0" y1="0" x2="1" y2=".8">
                  <stop offset="0" stopColor={Math.floor(i / 2) % 2 ? "#f1bd80" : "#f6d996"} />
                  <stop offset=".42" stopColor={Math.floor(i / 2) % 2 ? "#bd7046" : "#d5a34e"} />
                  <stop offset=".5" stopColor="#f0c882" />
                  <stop offset=".62" stopColor={Math.floor(i / 2) % 2 ? "#a45e3a" : "#bd853a"} />
                  <stop offset="1" stopColor="#785035" />
                </linearGradient>
              </defs>
              <path
                d={
                  Math.floor(i / 2) % 2
                    ? "M5 34C0 13 18 4 35 5C36 25 28 39 5 34Z"
                    : "M6 34L8 24L2 20L13 18L12 7L21 13L30 3L31 17L38 19L29 26L32 33L20 31Z"
                }
                fill={`url(#leaf-shade-${i})`}
                stroke="#805436"
                strokeWidth="1"
              />
              <path
                d="M7 32Q13 17 30 9"
                fill="none"
                stroke="#f6dcaa"
                strokeWidth=".7"
                opacity=".75"
              />
              <path
                d="M5 35L29 11M14 26L12 18M20 20L29 21"
                fill="none"
                stroke="#805436"
                strokeWidth="1.3"
              />
            </>
          )}
        </svg>
      ))}
      {stars}
    </div>
  );
});

export default Flowers;
