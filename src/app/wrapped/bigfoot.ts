// The Bigfoot slide's art: Bigfoot in braille dots, in front of a rainbow flag that
// fills the slide and waves. The flag leaves the cells behind Bigfoot blank.
import { CHAR_WIDTH } from "./ascii";

/** A stretch of characters in one color */
export interface ArtRun {
  text: string;
  color: string;
}

/** Mid-stride, looking back. Each braille character is 2 dots wide and 4 tall. */
export const BIGFOOT = String.raw`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣾⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣴⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣤⣶⣶⣶⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠋⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⣾⣿⣿⣿⣿⠛⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢰⣿⣿⣿⣿⣿⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⣾⣿⣿⣿⡟⠁⠈⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⠀⠀⠀⠀⠀⠀
⢀⣿⣿⣿⡟⠀⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⡿⠁⠙⠛⠿⣿⣿⣿⣷⡄⠀⠀⠀⠀
⢸⣿⣿⣿⣷⡄⠀⠹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⡀⠀⠀⠈⢻⣿⣿⣿⣦⠀⠀⠀
⠘⣿⣿⣿⠙⠇⠀⠀⠘⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⢿⠉⢹⣿⡇⠀⠀
⠀⠀⠙⠛⠛⠂⠀⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡄⠀⠀⠀⠸⠛⠁⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⣿⣿⣿⣿⡿⢿⣿⣿⣿⣿⣿⣦⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣠⣤⣶⣿⣿⣿⣿⣿⠃⠀⠈⢻⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢠⣾⣿⣿⣿⣿⣿⣿⡿⠋⠀⠀⠀⢸⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣠⣿⣿⣿⣿⣿⣿⡿⠋⠀⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀
⠀⢀⣤⣾⣿⣿⣿⣿⡿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⢿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀
⣴⣿⣿⣿⣿⣿⠟⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢻⣿⣿⣿⣧⣤⣤⣀⣠⣤
⠻⣿⣿⣿⣿⣿⣿⣦⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⠏
⠀⠀⠀⠀⠙⠛⠿⠿⠛⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣿⣿⠿⠟⠛⠛⠉⠀
`
  .replace(/^\n|\n$/g, "")
  .split("\n");
const BLANK = "\u2800";

// Where Bigfoot sits on the slide, in cqw. Each character gets a box CHAR_WIDTH wide and
// 1 tall at this size, so he lands in the same place whatever font draws the braille.
export const BIGFOOT_FONT_CQW = 2.8;
export const BIGFOOT_TOP_CQW = 6;
export const BIGFOOT_LEFT_CQW = 100 - 3 - 30 * CHAR_WIDTH * BIGFOOT_FONT_CQW;

export const FLAG_FONT_CQW = 0.9;
// Enough cells to cover the whole 4:3 slide at that size
const COLS = 186;
const ROWS = 84;
const FLAG_COLORS = ["#e40303", "#ff8c00", "#f7d000", "#008026", "#004dff", "#750787"];
// Lighter characters where a fold catches the light, heavier in the creases
const FOLDS = "-=+*#";

function behindBigfoot(col: number, row: number) {
  const x = (col + 0.5) * CHAR_WIDTH * FLAG_FONT_CQW - BIGFOOT_LEFT_CQW;
  const y = (row + 0.5) * FLAG_FONT_CQW - BIGFOOT_TOP_CQW;
  const char = BIGFOOT[Math.floor(y / BIGFOOT_FONT_CQW)]?.[Math.floor(x / (CHAR_WIDTH * BIGFOOT_FONT_CQW))];
  return char !== undefined && char !== BLANK;
}

const BEHIND = Array.from({ length: ROWS }, (_, row) =>
  Array.from({ length: COLS }, (_, col) => behindBigfoot(col, row)),
);

/** The flag at a moment, as lines of colored runs. Time is in seconds. */
export function drawPrideFlag(time: number): ArtRun[][] {
  // Two waves rolling across, so it never looks like a plain sine
  const lift: number[] = [];
  const light: number[] = [];
  for (let col = 0; col < COLS; col++) {
    const a = col * 0.07 - time * 2.2;
    const b = col * 0.16 - time * 3.1 + 1;
    lift.push(2.6 * Math.sin(a) + 0.9 * Math.sin(b));
    // How steeply the cloth turns here, which decides how much light it catches
    const slope = 2.6 * 0.07 * Math.cos(a) + 0.9 * 0.16 * Math.cos(b);
    light.push(Math.min(1, Math.max(0, 0.5 + slope * 1.6)));
  }

  return Array.from({ length: ROWS }, (_, row) => {
    const runs: ArtRun[] = [];
    for (let col = 0; col < COLS; col++) {
      const down = (row + 0.5 - lift[col]) / ROWS;
      const stripe = Math.min(FLAG_COLORS.length - 1, Math.max(0, Math.floor(down * FLAG_COLORS.length)));
      const char = BEHIND[row][col]
        ? " "
        : FOLDS[Math.min(FOLDS.length - 1, Math.floor((1 - light[col]) * FOLDS.length))];
      const color = FLAG_COLORS[stripe];
      const last = runs[runs.length - 1];
      // A space looks the same in any color, so it never starts a new run
      if (last && (last.color === color || char === " ")) last.text += char;
      else runs.push({ text: char, color });
    }
    return runs;
  });
}
