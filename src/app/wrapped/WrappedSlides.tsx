import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComponentType,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSiteLogos } from "@/services/siteThemeService";
import {
  BOLT,
  BREAKER,
  CHAR_WIDTH,
  GIFT,
  drawSaturn,
  drawVortex,
  SATURN_FONT_CQW,
  VORTEX_FONT_CQW,
  rasterize,
  ringRows,
  scramble,
  textBox,
} from "./ascii";
import {
  BIGFOOT,
  BIGFOOT_FONT_CQW,
  BIGFOOT_LEFT_CQW,
  BIGFOOT_TOP_CQW,
  drawPrideFlag,
  FLAG_FONT_CQW,
} from "./bigfoot";
import type { WrappedData } from "./wrappedData";
import "./wrapped.css";

type SlideProps = { data: WrappedData };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SWIPE_PX = 40;
const SATURN_FRAME_MS = 125;
const VORTEX_FRAME_MS = 80;
const FLAG_FRAME_MS = 100;
const BIGFOOT_SONG = "/caleb.mp3";
const WORD_FONT = '200px "Souvenir", Georgia, serif';
const RING_COLS = 34;
const RING_ROWS = 20;
const RING_HOLE = 0.58;
const RING_WIDTH_CQW = 38;
const NUMBER_WIDTH_CQW = 42;
const NUMBER_HEIGHT_CQW = 40;

const plural = (count: number, word: string) => (count === 1 ? word : `${word}s`);

const delay = (ms: number) => ({ "--wr-delay": `${ms}ms` }) as CSSProperties;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Runs from 0 to 1 once when the slide appears, or stays at 1 for reduced motion. */
function useProgress(ms: number, delayMs = 0) {
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ms, delayMs]);

  return progress;
}

function AsciiArt({
  lines,
  label,
  widthCqw,
  maxHeightCqw = Infinity,
  className = "",
}: {
  lines: string[];
  label: string;
  widthCqw: number;
  maxHeightCqw?: number;
  className?: string;
}) {
  const progress = useProgress(900, 100);
  const cols = useMemo(() => Math.max(...lines.map((line) => line.length)), [lines]);

  return (
    <pre
      className={`wr-ascii ${className}`}
      role="img"
      aria-label={label}
      style={{ fontSize: `${Math.min(widthCqw / (cols * CHAR_WIDTH), maxHeightCqw / lines.length)}cqw` }}
    >
      {scramble(lines, progress)}
    </pre>
  );
}

/** Seconds since the art appeared, ticking every frameMs. Stays at 0 for people who ask for less motion. */
function useArtClock(frameMs: number) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const started = performance.now();
    const timer = setInterval(() => setTime((performance.now() - started) / 1000), frameMs);
    return () => clearInterval(timer);
  }, [frameMs]);

  return time;
}

/** Saturn redrawn a few times a second */
export function LiveSaturn() {
  const time = useArtClock(SATURN_FRAME_MS);
  const lines = useMemo(() => drawSaturn(time), [time]);

  return (
    <AsciiArt
      lines={lines}
      label="Saturn and its rings"
      widthCqw={lines[0].length * CHAR_WIDTH * SATURN_FONT_CQW}
      className="wr-planet"
    />
  );
}

/** A spiral of characters turning behind the whole slide */
function LiveVortex() {
  const time = useArtClock(VORTEX_FRAME_MS);
  const lines = useMemo(() => drawVortex(time), [time]);

  return (
    <AsciiArt
      lines={lines}
      label="A turning spiral"
      widthCqw={lines[0].length * CHAR_WIDTH * VORTEX_FONT_CQW}
      className="wr-vortex"
    />
  );
}

/** Serif text redrawn in characters, as big as fits. Stretch makes it taller than the font's own shape. */
function AsciiWord({ text, cols, stretch }: { text: string; cols: number; stretch: number }) {
  // undefined while the font loads, null if the browser cannot draw it
  const [lines, setLines] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    document.fonts
      .load(WORD_FONT, text)
      .catch(() => undefined)
      .then(() => {
        if (alive) setLines(rasterize(text, WORD_FONT, cols, stretch));
      });
    return () => {
      alive = false;
    };
  }, [text, cols, stretch]);

  if (lines === undefined) return null;
  if (lines === null) return <div className="wr-xl">{text}</div>;
  return (
    <AsciiArt
      lines={lines}
      label={text}
      widthCqw={NUMBER_WIDTH_CQW}
      maxHeightCqw={NUMBER_HEIGHT_CQW}
      className="wr-center"
    />
  );
}

function AsciiBar({
  rows,
  width,
  char,
  fontCqw,
  delayMs = 0,
}: {
  rows: number;
  width: number;
  char: string;
  fontCqw: number;
  delayMs?: number;
}) {
  const progress = useProgress(800, delayMs);
  const shown = Math.round(rows * progress);

  return (
    <pre
      className="wr-ascii wr-bar"
      aria-hidden="true"
      style={{ fontSize: `${fontCqw}cqw`, height: `${rows * fontCqw}cqw` }}
    >
      {Array(shown).fill(char.repeat(width)).join("\n")}
    </pre>
  );
}

export function Logo({ className }: { className: string }) {
  const { logoUrl, hideLogo } = useSiteLogos();
  if (hideLogo) return null;
  return <img src={logoUrl} alt="" className={className} />;
}

function SlideTop() {
  return (
    <div className="wr-top">
      <Logo className="wr-logo-sm" />
      WRAPPED
    </div>
  );
}

function CoverSlide({ data }: SlideProps) {
  const stillGoing = new Date().getFullYear() === data.year;
  return (
    <div className="wr-body">
      <div className="wr-top wr-rise">{`> ${data.year}${stillGoing ? " SO FAR" : ""}`}</div>
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-wrapped wr-rise" style={delay(200)}>
            Wrapped.
          </div>
          <div className="wr-text wr-rise" style={delay(320)}>
            {data.firstName ? `${data.firstName}'s year in ampOS.` : "Your year in ampOS."}
          </div>
          <Logo className="wr-logo-md wr-rise" />
        </div>
        <AsciiArt lines={GIFT} label="A wrapped gift" widthCqw={38} className="wr-accent wr-center" />
      </div>
    </div>
  );
}

function ReportsSlide({ data }: SlideProps) {
  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-sm wr-rise">
            <em>You worked on</em>
          </div>
          <div className="wr-text wr-rise" style={delay(400)}>
            Every one written, checked and filed in ampOS.
          </div>
        </div>
        <div className="wr-col">
          <AsciiWord text={data.reports.toLocaleString()} cols={56} stretch={1.3} />
          <div className="wr-lg wr-center wr-rise" style={delay(200)}>
            {plural(data.reports, "report")}.
          </div>
        </div>
      </div>
    </div>
  );
}

function LastYearSlide({ data }: SlideProps) {
  const { reports, lastYearReports, year } = data;
  const firstYear = lastYearReports === 0;
  const multiple = reports / Math.max(1, lastYearReports);
  const bars = [
    {
      label: new Date().getFullYear() === year ? `${year}, so far` : String(year),
      value: reports,
      accent: true,
    },
    ...(firstYear ? [] : [{ label: String(year - 1), value: lastYearReports, accent: false }]),
  ].reverse();

  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-md wr-rise">
          {firstYear ? (
            <>
              Your <em className="wr-accent">first year</em> in ampOS.
            </>
          ) : multiple >= 1.5 ? (
            <>
              <em className="wr-accent">{multiple.toFixed(1)}x</em> more reports than last year.
            </>
          ) : (
            <>
              <em className="wr-accent">More</em> reports than last year.
            </>
          )}
        </div>
        <div className="wr-yoy">
          {bars.map((bar, i) => (
            <div key={bar.label} className={bar.accent ? "wr-accent" : undefined}>
              <span>{bar.value.toLocaleString()}</span>
              <AsciiBar
                rows={Math.max(1, Math.round((bar.value / reports) * 12))}
                width={10}
                char={bar.accent ? "#" : "+"}
                fontCqw={2.6}
                delayMs={150 + i * 200}
              />
              <em>{bar.label}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OutTheDoorSlide({ data }: SlideProps) {
  const { sent, inProgress, approvedOrReady, other } = data.status;
  const total = sent + inProgress + approvedOrReady + other;
  const parts = [
    { label: "sent", value: sent, char: "@", color: "var(--brand)" },
    { label: "in progress", value: inProgress, char: "o", color: "var(--wr-paper)" },
    { label: "approved or ready", value: approvedOrReady, char: "+", color: "var(--wr-peach)" },
    { label: "everything else", value: other, char: ".", color: "var(--wr-dim)" },
  ];
  const percent = Math.round((sent / total) * 100);
  const progress = useProgress(1100, 150);
  const rows = ringRows(
    parts.map((part) => part.value / total),
    RING_COLS,
    RING_ROWS,
    RING_HOLE,
    progress,
  );

  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-md wr-rise">
            {percent > 50 ? "Most of it is " : "More on the way, and "}
            {percent <= 50 && `${percent}% is `}
            <em className="wr-accent">out the door.</em>
          </div>
          <div className="wr-legend">
            {parts.map((part) => (
              <div key={part.label}>
                <i style={{ color: part.color }}>{part.char}</i>
                <span>
                  <b>{part.value.toLocaleString()}</b>
                  {part.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="wr-ring">
          <pre
            className="wr-ascii"
            role="img"
            aria-label={`${percent}% of reports sent`}
            style={{ fontSize: `${RING_WIDTH_CQW / (RING_COLS * CHAR_WIDTH)}cqw` }}
          >
            {rows.map((runs, y) => (
              <Fragment key={y}>
                {y > 0 && "\n"}
                {runs.map((run, x) =>
                  run.part < 0 ? (
                    " ".repeat(run.length)
                  ) : (
                    <span key={x} style={{ color: parts[run.part].color }}>
                      {parts[run.part].char.repeat(run.length)}
                    </span>
                  ),
                )}
              </Fragment>
            ))}
          </pre>
          <b>{percent}%</b>
        </div>
      </div>
    </div>
  );
}

function KindsSlide({ data }: SlideProps) {
  const { typesUsed, typesTotal } = data;
  const progress = useProgress(1000, 150);
  const filled = Math.round(typesUsed * progress);

  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-xl wr-accent wr-rise">{typesUsed}</div>
          <div className="wr-md wr-rise" style={delay(120)}>
            of {typesTotal} kinds of reports.
          </div>
          <div className="wr-text">Every [x] is one you used.</div>
        </div>
        <div className="wr-boxes" aria-hidden="true">
          {Array.from({ length: typesTotal }, (_, i) => (
            <span key={i} className={i < filled ? "on" : undefined}>
              {i < filled ? "[x]" : "[ ]"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopReportSlide({ data }: SlideProps) {
  if (!data.topType) return null;
  const { title, name, count } = data.topType;
  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-title wr-rise" style={delay(200)}>
            <em>{title}</em>
          </div>
          <div className="wr-text wr-rise" style={delay(350)}>
            {`${count} ${name} ${plural(count, "report")}. ${Math.round((count / data.reports) * 100)}% of your year.`}
          </div>
        </div>
        {title.includes("Breaker") ? (
          <AsciiArt lines={BREAKER} label="A circuit breaker" widthCqw={34} className="wr-center" />
        ) : (
          <AsciiWord text={String(count)} cols={56} stretch={1.3} />
        )}
      </div>
    </div>
  );
}

function BusiestMonthSlide({ data }: SlideProps) {
  const { months, bestDay } = data;
  const peak = Math.max(...months);
  const peakIndex = months.indexOf(peak);

  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-md wr-rise">
            <em className="wr-accent">{MONTH_NAMES[peakIndex]}</em> was your month.
          </div>
          {bestDay && (
            <div className="wr-text wr-rise" style={delay(600)}>
              {`Biggest single day: ${bestDay.count} ${plural(bestDay.count, "report")} on ${bestDay.label}.`}
            </div>
          )}
        </div>
        <div className="wr-months" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((count, i) => {
            const isPeak = i === peakIndex;
            return (
              <div key={MONTH_NAMES[i]} className={isPeak ? "hi" : undefined}>
                {isPeak && <b>{count}</b>}
                <AsciiBar
                  rows={Math.max(1, Math.round((count / peak) * 14))}
                  width={2}
                  char={isPeak ? "#" : ":"}
                  fontCqw={2.4}
                  delayMs={100 + i * 50}
                />
                <span>{MONTH_NAMES[i][0]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JobsSlide({ data }: SlideProps) {
  const stats = [
    { value: data.jobs, label: plural(data.jobs, "job"), accent: false },
    { value: data.customers, label: plural(data.customers, "customer"), accent: true },
  ];

  return (
    <>
      <LiveSaturn />
      <div className="wr-body">
        <SlideTop />
        <div className="wr-grow" />
        <div className="wr-stats">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`wr-rise ${stat.accent ? "wr-accent" : ""}`}
              style={delay(200 + i * 150)}
            >
              <b>{stat.value}</b>
              <em>{stat.label}</em>
            </div>
          ))}
        </div>
        <div className="wr-text wr-rise" style={delay(500)}>
          Most reports on one job: {data.mostOnOneJob}.
        </div>
      </div>
    </>
  );
}

function EstimatesSlide({ data }: SlideProps) {
  const { made, quotes, customers, won } = data.estimates;
  const stats = [
    { value: made, label: plural(made, "estimate"), accent: false },
    { value: customers, label: plural(customers, "customer"), accent: true },
  ];

  return (
    <>
      <LiveVortex />
      <div className="wr-body">
        <SlideTop />
        <div className="wr-grow" />
        <div className="wr-sm wr-rise">
          <em>You built</em>
        </div>
        <div className="wr-stats">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`wr-rise ${stat.accent ? "wr-accent" : ""}`}
              style={delay(200 + i * 150)}
            >
              <b>{stat.value.toLocaleString()}</b>
              <em>{stat.label}</em>
            </div>
          ))}
        </div>
        <div className="wr-text wr-rise" style={delay(500)}>
          {`Across ${quotes.toLocaleString()} ${plural(quotes, "quote")}.`}
          {won > 0 ? ` ${won.toLocaleString()} won.` : ""}
        </div>
      </div>
    </>
  );
}

/** A rainbow flag waving across the whole slide, with Bigfoot in front of it */
function BigfootScene() {
  const time = useArtClock(FLAG_FRAME_MS);
  const flag = useMemo(() => drawPrideFlag(time), [time]);

  return (
    <div
      className="wr-bigfoot"
      role="img"
      aria-label="Bigfoot walking in front of a waving rainbow flag"
    >
      <pre className="wr-ascii" style={{ fontSize: `${FLAG_FONT_CQW}cqw` }}>
        {flag.map((runs, row) => (
          <Fragment key={row}>
            {runs.map((run, i) => (
              <span key={i} style={{ color: run.color }}>
                {run.text}
              </span>
            ))}
            {"\n"}
          </Fragment>
        ))}
      </pre>
      {/* Each character in a fixed box, so he lines up with the blank cells the flag leaves */}
      <pre
        className="wr-ascii wr-bigfoot-figure"
        style={{
          fontSize: `${BIGFOOT_FONT_CQW}cqw`,
          top: `${BIGFOOT_TOP_CQW}cqw`,
          left: `${BIGFOOT_LEFT_CQW}cqw`,
        }}
      >
        {BIGFOOT.map((line, row) => (
          <Fragment key={row}>
            {Array.from(line, (char, col) => (
              <span key={col}>{char}</span>
            ))}
            {"\n"}
          </Fragment>
        ))}
      </pre>
    </div>
  );
}

/** One person only, see getsBigfootSlide */
function BigfootSlide({ data }: SlideProps) {
  const name = data.firstName.toLowerCase();

  return (
    <>
      <BigfootScene />
      <div className="wr-body wr-on-flag">
        <SlideTop />
        <div className="wr-grow" />
        <div className="wr-bigfoot-words">
          <div className="wr-md wr-fade" style={delay(1400)}>
            <span>{name ? "no one will believe you," : "no one will believe you."}</span>
          </div>
          {name && (
            <div className="wr-thanks wr-fade" style={delay(2600)}>
              <span>
                <em className="wr-accent">{name}</em>.
              </span>
            </div>
          )}
        </div>
        <div className="wr-grow" />
      </div>
    </>
  );
}

function BetterSlide({ data }: SlideProps) {
  const { shippedIdea } = data;
  const rows = [
    { mark: "[!]", value: data.issues, label: "issues reported" },
    { mark: "[*]", value: data.ideas, label: "feature ideas" },
    { mark: "[+]", value: data.fixed, label: "fixed or built" },
  ];
  const card = useMemo(
    () => (shippedIdea ? textBox("YOUR IDEA THAT SHIPPED", shippedIdea, 30) : null),
    [shippedIdea],
  );

  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-md wr-rise">
            You made ampOS <em className="wr-accent">better.</em>
          </div>
          {card && (
            <AsciiArt
              lines={card}
              label={`Your idea that shipped: ${shippedIdea}`}
              widthCqw={40}
              className="wr-accent"
            />
          )}
        </div>
        <div className="wr-log">
          {rows.map((row, i) => (
            <div key={row.label} className="wr-rise" style={delay(150 + i * 150)}>
              <i>{row.mark}</i>
              <b>{row.value}</b>
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThanksSlide({ data }: SlideProps) {
  const { firstName, reports, teamReports } = data;
  return (
    <div className="wr-body">
      <SlideTop />
      <div className="wr-split">
        <div className="wr-col">
          <div className="wr-thanks wr-rise">
            Thanks{firstName ? ", " : ""}
            <em className="wr-accent">{firstName || "."}</em>
            {firstName ? "." : ""}
          </div>
          <div className="wr-text wr-rise" style={delay(300)}>
            {`Together we filed ${teamReports.toLocaleString()} reports this year.${
              reports > 0 ? ` Here's to your next ${reports.toLocaleString()}.` : ""
            }`}
          </div>
          <Logo className="wr-logo-md wr-rise" />
        </div>
        <AsciiArt
          lines={BOLT}
          label="A lightning bolt"
          widthCqw={32}
          maxHeightCqw={40}
          className="wr-accent wr-center"
        />
      </div>
    </div>
  );
}

type Tone = "ink" | "orange" | "paper";

/** Only the slides that fit. Nobody gets told they dropped or shown a zero. */
function slidesFor(data: WrappedData): { tone: Tone; Body: ComponentType<SlideProps> }[] {
  const hasReports = data.reports > 0;
  const slides: { tone: Tone; Body: ComponentType<SlideProps>; show: boolean }[] = [
    { tone: "ink", Body: CoverSlide, show: true },
    { tone: "orange", Body: ReportsSlide, show: hasReports },
    {
      tone: "paper",
      Body: LastYearSlide,
      show: hasReports && data.reports > data.lastYearReports,
    },
    { tone: "ink", Body: OutTheDoorSlide, show: data.status.sent > 0 },
    { tone: "paper", Body: KindsSlide, show: data.typesUsed >= 3 },
    { tone: "orange", Body: TopReportSlide, show: data.topType !== null },
    { tone: "ink", Body: BusiestMonthSlide, show: hasReports },
    { tone: "paper", Body: JobsSlide, show: hasReports },
    { tone: "orange", Body: EstimatesSlide, show: data.estimates.made > 0 },
    { tone: "paper", Body: BigfootSlide, show: data.bigfoot },
    { tone: "ink", Body: BetterSlide, show: data.issues + data.ideas > 0 },
    { tone: "paper", Body: ThanksSlide, show: true },
  ];
  return slides.filter((slide) => slide.show);
}

/**
 * The Bigfoot slide's song. Downloaded as soon as Wrapped opens, and only for the person who
 * gets that slide, so it starts the moment they reach it. Plays until Wrapped closes.
 */
function useBigfootSong(enabled: boolean) {
  const song = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const audio = new Audio(BIGFOOT_SONG);
    audio.preload = "auto";
    audio.load();
    song.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      song.current = null;
    };
  }, [enabled]);

  return useCallback(() => {
    const audio = song.current;
    // Coming back to the slide while it plays shouldn't restart it
    if (!audio || !audio.paused) return;
    // If the browser blocks it, the slide still works without sound
    audio.play().catch(() => undefined);
  }, []);
}

/** The slides, shown over the portal. onFinish fires on reaching the last one. */
export default function WrappedSlides({
  data,
  preview,
  onClose,
  onFinish,
}: {
  data: WrappedData;
  preview: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const slides = useMemo(() => slidesFor(data), [data]);
  const lastIndex = slides.length - 1;
  const [index, setIndex] = useState(0);
  const pointerStartX = useRef<number | null>(null);
  const startSong = useBigfootSong(data.bigfoot);

  const step = useCallback(
    (delta: number) => {
      const next = Math.min(lastIndex, Math.max(0, index + delta));
      setIndex(next);
      // Started here, inside the tap or key press, because browsers only let sound start from one
      if (slides[next].Body === BigfootSlide) startSong();
    },
    [index, lastIndex, slides, startSong],
  );

  useEffect(() => {
    if (index === lastIndex) onFinish();
  }, [index, lastIndex, onFinish]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        step(-1);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, onClose]);

  // A swipe moves either way. A tap goes back on the left third, forward elsewhere.
  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startX = pointerStartX.current;
    pointerStartX.current = null;
    if (startX === null) return;

    const moved = e.clientX - startX;
    if (Math.abs(moved) > SWIPE_PX) {
      step(moved < 0 ? 1 : -1);
      return;
    }
    const { left, width } = e.currentTarget.getBoundingClientRect();
    step(e.clientX - left < width * 0.35 ? -1 : 1);
  };

  const { tone, Body } = slides[index];

  return (
    <div className="wr-popup" role="dialog" aria-modal="true" aria-label="Your ampOS Wrapped">
      <button
        type="button"
        className="wr-arrow"
        aria-label="Previous slide"
        disabled={index === 0}
        onClick={() => step(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <div className={`wr-stage wr-tone-${tone}`}>
        <div
          className="wr-surface"
          onPointerDown={(e) => {
            pointerStartX.current = e.clientX;
          }}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            pointerStartX.current = null;
          }}
        >
          <div key={index} className="wr-slide">
            <Body data={data} />
          </div>
        </div>

        <div className="wr-chrome">
          <div className="wr-progress">
            {slides.map((_, i) => (
              <i key={i} className={i <= index ? "on" : undefined} />
            ))}
          </div>
          <button type="button" className="wr-close" aria-label="Close Wrapped" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
          {preview && <div className="wr-sample">PREVIEW</div>}
        </div>
      </div>

      <button
        type="button"
        className="wr-arrow"
        aria-label="Next slide"
        disabled={index === lastIndex}
        onClick={() => step(1)}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
