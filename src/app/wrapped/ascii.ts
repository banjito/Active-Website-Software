// Monospace characters are 0.6em wide, so n characters take up 0.6n em.
export const CHAR_WIDTH = 0.6;

const RAMP = " .:-=+*#%@";
const STIPPLE = " .,:;?%$#@";
const GLYPHS = "!#$%&*+=?/\\|<>~^";
const SUPERSAMPLE = 4;

const art = (drawing: string) => drawing.replace(/^\n|\n$/g, "").split("\n");

export const GIFT = art(String.raw`
      .-"""-.   .-"""-.
     /   _   \ /   _   \
     \  (_)   V   (_)  /
      '-.___.-+-.___.-'
.-------------+-------------.
|             |             |
'-------------+-------------'
 |            |            |
 |            |            |
 |            |            |
 |            |            |
 |            |            |
 '------------+------------'
`);

export const BREAKER = art(String.raw`
  | |     | |     | |
.-+-+-----+-+-----+-+-.
| (o)     (o)     (o) |
|                     |
|   .-------------.   |
|   |     ON      |   |
|   |   [#####]   |   |
|   |   [     ]   |   |
|   |     OFF     |   |
|   '-------------'   |
|                     |
|   LV MCCB   600 A   |
| (o)     (o)     (o) |
'-+-+-----+-+-----+-+-'
  | |     | |     | |
`);

const noise = (col: number, row: number) => {
  const n = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/** How much ink the ring holds at a distance from the planet's center, in planet radii. */
function ringInk(reach: number) {
  if (reach < 1.28 || reach > 2.08) return 0;
  if (reach > 1.66 && reach < 1.74) return 0.02;
  const innerFade = Math.min(1, (reach - 1.28) / 0.1);
  return innerFade * (0.62 + 0.2 * Math.sin(reach * 26) + 0.1 * Math.sin(reach * 61));
}

/**
 * A big Saturn in fine stippled characters. Sizes are in cqw, measured from the
 * top left of whatever holds it. Place the planet so the ring runs off the right edge.
 * More ink means darker, because this one sits on paper. Time is in seconds:
 * redrawing with a later time moves the ring and clouds and twinkles the characters.
 */
function stippledSaturn(
  cols: number,
  rows: number,
  fontCqw: number,
  centerX: number,
  centerY: number,
  radius: number,
  time: number,
): string[] {
  const tilt = 0.36;
  const ringSquash = 0.3;
  const light = [-0.5, -0.55, 0.67];
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  return Array.from({ length: rows }, (_, row) => {
    let line = "";
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * fontCqw * CHAR_WIDTH - centerX;
      const y = (row + 0.5) * fontCqw - centerY;
      const along = x * cos + y * sin;
      const across = -x * sin + y * cos;
      const reach = Math.hypot(along, across / ringSquash) / radius;
      // Rings look densest at their far left and right tips
      const tips = 0.55 + 0.6 * (Math.abs(along) / (radius * reach)) ** 3;
      const ring = ringInk(reach) * tips;
      // Clumps of material drifting around the planet
      const drift = 1 + 0.3 * Math.sin(Math.atan2(across / ringSquash, along) * 6 + reach * 8 - time * 0.8);

      let ink = ring * drift;
      const ringInFront = ring > 0 && across > 0;
      if (x * x + y * y <= radius * radius && !ringInFront) {
        const z = Math.sqrt(radius * radius - x * x - y * y);
        // The light vector is not exactly unit length, so this can land just over 1
        const lit = Math.min(1, Math.max(0, (x * light[0] + y * light[1] + z * light[2]) / radius));
        const bands =
          0.08 * Math.sin((across / radius) * 14) +
          0.05 * Math.sin((along / radius) * 6 + (across / radius) * 9 - time * 0.5);
        const edge = 0.6 * (1 - z / radius) ** 2;
        // A thin blank line on each side of the ring, so it reads as in front of the planet
        const besideRing =
          across > 0 && ((reach > 1.2 && reach < 1.28) || (reach > 2.08 && reach < 2.16));
        ink = besideRing ? 0 : 0.2 + 0.6 * (1 - lit) ** 1.3 + bands + edge;
      }
      if (ink > 0) {
        const grain = noise(col, row);
        ink += (grain - 0.5) * 0.16 + 0.05 * Math.sin(time * (1 + grain * 2) + grain * 40);
      }
      const clamped = Math.min(0.99, Math.max(0, ink));
      line += STIPPLE[Math.floor(clamped * STIPPLE.length)];
    }
    return line;
  });
}

export const SATURN_FONT_CQW = 1;
export const drawSaturn = (time: number) =>
  stippledSaturn(168, 76, SATURN_FONT_CQW, 90, 34, 27, time);

const PLASMA = " .:-=+*#%@";

/**
 * The "vortex" plasma from asciiart.eu: arms of a spiral turning around a point, with
 * slow rings and ripples running through it. Fills cols by rows. Time is in seconds.
 */
function plasmaVortex(
  cols: number,
  rows: number,
  centerCol: number,
  centerRow: number,
  time: number,
): string[] {
  return Array.from({ length: rows }, (_, row) => {
    let line = "";
    for (let col = 0; col < cols; col++) {
      // Characters are taller than wide, so columns are squeezed to keep the spiral round
      const x = (col - centerCol) * CHAR_WIDTH;
      const y = row - centerRow;
      const distance = Math.hypot(x, y);
      const arms = Math.sin(Math.atan2(y, x) * 3 + distance * 0.35 - time * 2);
      const rings = Math.sin(distance * 0.18 - time * 1.2);
      const ripple = Math.sin(x * 0.12 + time) * Math.cos(y * 0.15 - time * 0.7);
      const value = (arms + 0.5 * rings + 0.5 * ripple + 2) / 4;
      line += PLASMA[Math.min(PLASMA.length - 1, Math.floor(value * PLASMA.length))];
    }
    return line;
  });
}

export const VORTEX_FONT_CQW = 1.4;
/** Covers the whole 4:3 slide, turning around a point right of center */
export const drawVortex = (time: number) => plasmaVortex(120, 54, 84, 27, time);

export const BOLT = art(String.raw`
      ########
     ########
    ########
   ########
  ########
 ############
###########'
    .#####'
    ####'
   .###'
   ##'
  .#'
  '
`);

/** Draws text into a hidden canvas and turns how much ink each cell holds into a character. */
export function rasterize(
  text: string,
  font: string,
  cols: number,
  stretch = 1,
): string[] | null {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;
  measure.font = font;
  const box = measure.measureText(text);
  const inkWidth = box.actualBoundingBoxLeft + box.actualBoundingBoxRight;
  const inkHeight = box.actualBoundingBoxAscent + box.actualBoundingBoxDescent;
  if (!inkWidth || !inkHeight) return null;
  const rows = Math.round(cols * (inkHeight / inkWidth) * CHAR_WIDTH * stretch);

  const canvas = document.createElement("canvas");
  canvas.width = cols * SUPERSAMPLE;
  canvas.height = rows * SUPERSAMPLE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(canvas.width / inkWidth, canvas.height / inkHeight);
  ctx.font = font;
  ctx.fillText(text, box.actualBoundingBoxLeft, box.actualBoundingBoxAscent);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let col = 0; col < cols; col++) {
      let alpha = 0;
      for (let y = 0; y < SUPERSAMPLE; y++) {
        for (let x = 0; x < SUPERSAMPLE; x++) {
          const pixel = (row * SUPERSAMPLE + y) * canvas.width + col * SUPERSAMPLE + x;
          alpha += data[pixel * 4 + 3];
        }
      }
      const ink = alpha / (255 * SUPERSAMPLE * SUPERSAMPLE);
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(ink * RAMP.length))];
    }
    lines.push(line);
  }
  return lines;
}

/** Each character flickers until progress (0 to 1) reaches its own settling point. */
export function scramble(lines: string[], progress: number): string {
  if (progress >= 1) return lines.join("\n");
  return lines
    .map((line, y) =>
      Array.from(line, (char, x) => {
        if (char === " ") return char;
        const settlesAt = ((x * 7 + y * 13) % 17) / 17;
        if (progress >= settlesAt) return char;
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }).join(""),
    )
    .join("\n");
}

/** Splits a ring into runs of characters. Part is -1 for blank, else an index into shares. */
export function ringRows(
  shares: number[],
  cols: number,
  rows: number,
  hole: number,
  progress: number,
): { part: number; length: number }[][] {
  let running = 0;
  const stops = shares.map((share) => (running += share));

  return Array.from({ length: rows }, (_, row) => {
    const runs: { part: number; length: number }[] = [];
    for (let col = 0; col < cols; col++) {
      const dx = (col + 0.5 - cols / 2) / (cols / 2);
      const dy = (row + 0.5 - rows / 2) / (rows / 2);
      const distance = Math.hypot(dx, dy);
      // 0 at the top of the ring, going clockwise to 1
      const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
      const inRing = distance <= 1 && distance >= hole && turn <= progress;
      const part = inRing ? stops.findIndex((stop) => turn <= stop) : -1;

      const last = runs[runs.length - 1];
      if (last && last.part === part) last.length += 1;
      else runs.push({ part, length: 1 });
    }
    return runs;
  });
}

/** A plain-text card that wraps its body to fit. */
export function textBox(title: string, body: string, width: number): string[] {
  const inner = width - 4;
  const wrapped: string[] = [];
  for (const word of body.split(" ")) {
    const line = wrapped[wrapped.length - 1];
    if (line !== undefined && `${line} ${word}`.length <= inner) {
      wrapped[wrapped.length - 1] = `${line} ${word}`;
    } else {
      wrapped.push(word.slice(0, inner));
    }
  }
  const rule = `+${"-".repeat(width - 2)}+`;
  const row = (text: string) => `| ${text.padEnd(inner)} |`;
  return [rule, row(title), rule, ...wrapped.map(row), rule];
}
