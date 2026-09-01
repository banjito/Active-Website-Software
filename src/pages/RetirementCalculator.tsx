import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PiggyBank } from "lucide-react";

/**
 * Standalone 401(k) retirement calculator.
 *
 * Not wired into the router yet - drop <RetirementCalculator /> onto a route
 * whenever we are ready to show it to the field.
 *
 * Plan rule modeled here: the company matches dollar-for-dollar on the first
 * MATCH_CAP_PCT of pay. Contributing more than that is still good for you, it
 * just does not earn any extra match.
 */
const MATCH_CAP_PCT = 4;

const PAY_PERIODS: Record<string, { label: string; perYear: number }> = {
  weekly: { label: "Weekly (52/yr)", perYear: 52 },
  biweekly: { label: "Every 2 weeks (26/yr)", perYear: 26 },
  semimonthly: { label: "Twice a month (24/yr)", perYear: 24 },
  monthly: { label: "Monthly (12/yr)", perYear: 12 },
};

// Categorical slots 1-3 of the validated viz palette, light / dark steps.
const SERIES = {
  contributions: { light: "#2a78d6", dark: "#3987e5" },
  match: { light: "#eb6834", dark: "#d95926" },
  growth: { light: "#1baf7a", dark: "#199e70" },
};

interface YearRow {
  age: number;
  salary: number;
  contributions: number; // your money in: starting balance + everything you put in
  match: number; // cumulative employer match
  growth: number; // everything the market added on top
  total: number;
}

interface Inputs {
  currentAge: number;
  retirementAge: number;
  salary: number;
  startingBalance: number;
  contributionPct: number;
  returnPct: number;
  raisePct: number;
}

function project(inputs: Inputs, includeMatch: boolean): YearRow[] {
  const {
    currentAge,
    retirementAge,
    salary,
    startingBalance,
    contributionPct,
    returnPct,
    raisePct,
  } = inputs;

  const years = Math.max(0, retirementAge - currentAge);
  const monthlyRate = returnPct / 100 / 12;

  let balance = startingBalance;
  let paidIn = 0;
  let matched = 0;
  let pay = salary;

  const rows: YearRow[] = [
    {
      age: currentAge,
      salary: pay,
      contributions: startingBalance,
      match: 0,
      growth: 0,
      total: startingBalance,
    },
  ];

  for (let year = 0; year < years; year += 1) {
    const employeeMonthly = (pay * (contributionPct / 100)) / 12;
    const matchPct = includeMatch
      ? Math.min(contributionPct, MATCH_CAP_PCT)
      : 0;
    const employerMonthly = (pay * (matchPct / 100)) / 12;

    for (let month = 0; month < 12; month += 1) {
      balance = balance * (1 + monthlyRate) + employeeMonthly + employerMonthly;
      paidIn += employeeMonthly;
      matched += employerMonthly;
    }

    pay *= 1 + raisePct / 100;

    const contributions = startingBalance + paidIn;
    rows.push({
      age: currentAge + year + 1,
      salary: pay,
      contributions,
      match: matched,
      growth: Math.max(0, balance - contributions - matched),
      total: balance,
    });
  }

  return rows;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const moneyExact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const compact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
};

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setIsDark(root.classList.contains("dark"))
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

interface NumberInputProps {
  value: number;
  onCommit: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
}

/**
 * Numbers are held as a draft string while the field has focus and only
 * clamped on blur - clamping on every keystroke turns a half-typed "2" into
 * the minimum and makes ages impossible to type.
 */
function NumberInput({
  value,
  onCommit,
  min,
  max,
  step = 1,
  prefix,
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = Number(draft);
    const next =
      draft.trim() === "" || !Number.isFinite(parsed) ? value : parsed;
    const clamped = Math.min(max, Math.max(min, next));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        inputMode="numeric"
        className={prefix ? `${inputClass} pl-6` : inputClass}
        value={draft}
        step={step}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
}

function Slider({ value, onChange, min, max, step = 1, format }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <input
          type="range"
          className="mr-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-brand dark:bg-neutral-700"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
          {format(value)}
        </span>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  dotColor: string;
}

function Stat({ label, value, sub, dotColor }: StatProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-white">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0);

  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-1.5 font-semibold text-neutral-900 dark:text-white">
        Age {label}
      </div>
      {[...payload].reverse().map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="tabular-nums font-medium text-neutral-900 dark:text-white">
            {money(entry.value ?? 0)}
          </span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-neutral-200 pt-1.5 dark:border-neutral-700">
        <span className="text-neutral-600 dark:text-neutral-300">Balance</span>
        <span className="tabular-nums font-semibold text-neutral-900 dark:text-white">
          {money(total)}
        </span>
      </div>
    </div>
  );
}

export default function RetirementCalculator() {
  const isDark = useIsDark();
  const [payPeriod, setPayPeriod] = useState<keyof typeof PAY_PERIODS>("biweekly");
  const [inputs, setInputs] = useState<Inputs>({
    currentAge: 30,
    retirementAge: 65,
    salary: 75_000,
    startingBalance: 5_000,
    contributionPct: 4,
    returnPct: 7,
    raisePct: 2,
  });

  const set = <K extends keyof Inputs>(key: K, value: Inputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const rows = useMemo(() => project(inputs, true), [inputs]);
  const rowsNoMatch = useMemo(() => project(inputs, false), [inputs]);

  const final = rows[rows.length - 1];
  const finalNoMatch = rowsNoMatch[rowsNoMatch.length - 1];
  const matchedPct = Math.min(inputs.contributionPct, MATCH_CAP_PCT);
  const missingMatch = inputs.contributionPct < MATCH_CAP_PCT;

  const periodsPerYear = PAY_PERIODS[payPeriod].perYear;
  const yourPerCheck = (inputs.salary * (inputs.contributionPct / 100)) / periodsPerYear;
  const matchPerCheck = (inputs.salary * (matchedPct / 100)) / periodsPerYear;

  const color = (key: keyof typeof SERIES) =>
    isDark ? SERIES[key].dark : SERIES[key].light;
  const axisColor = isDark ? "#a3a3a3" : "#737373";
  const gridColor = isDark ? "#404040" : "#e5e5e5";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          401(k) Calculator
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          See what your retirement account could be worth. The company matches
          your contributions dollar-for-dollar up to {MATCH_CAP_PCT}% of your
          pay, so the first {MATCH_CAP_PCT}% you put in is instantly doubled.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Inputs */}
        <div className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <Field
            label="You contribute"
            hint={
              missingMatch
                ? `Bump this to ${MATCH_CAP_PCT}% to earn the full company match.`
                : inputs.contributionPct === MATCH_CAP_PCT
                  ? `You are getting the full company match.`
                  : `The company matches the first ${MATCH_CAP_PCT}%. The extra ${(inputs.contributionPct - MATCH_CAP_PCT).toFixed(1)}% is unmatched, but it is still your money.`
            }
          >
            <Slider
              value={inputs.contributionPct}
              onChange={(v) => set("contributionPct", v)}
              min={0}
              max={20}
              step={0.5}
              format={(v) => `${v}% of pay`}
            />
          </Field>

          <Field label="Annual salary">
            <NumberInput
              value={inputs.salary}
              onCommit={(v) => set("salary", v)}
              min={0}
              max={2_000_000}
              step={1000}
              prefix="$"
            />
          </Field>

          <Field label="Current 401(k) balance">
            <NumberInput
              value={inputs.startingBalance}
              onCommit={(v) => set("startingBalance", v)}
              min={0}
              max={10_000_000}
              step={1000}
              prefix="$"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Current age">
              <NumberInput
                value={inputs.currentAge}
                onCommit={(v) => set("currentAge", v)}
                min={16}
                max={inputs.retirementAge - 1}
              />
            </Field>
            <Field label="Retirement age">
              <NumberInput
                value={inputs.retirementAge}
                onCommit={(v) => set("retirementAge", v)}
                min={inputs.currentAge + 1}
                max={80}
              />
            </Field>
          </div>

          <Field
            label="Average annual return"
            hint="Historical stock market average is around 7% after inflation."
          >
            <Slider
              value={inputs.returnPct}
              onChange={(v) => set("returnPct", v)}
              min={0}
              max={12}
              step={0.5}
              format={(v) => `${v}%`}
            />
          </Field>

          <Field label="Yearly raise">
            <Slider
              value={inputs.raisePct}
              onChange={(v) => set("raisePct", v)}
              min={0}
              max={6}
              step={0.5}
              format={(v) => `${v}%`}
            />
          </Field>

          <Field label="Paid">
            <select
              className={inputClass}
              value={payPeriod}
              onChange={(e) =>
                setPayPeriod(e.target.value as keyof typeof PAY_PERIODS)
              }
            >
              {Object.entries(PAY_PERIODS).map(([key, period]) => (
                <option key={key} value={key}>
                  {period.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Balance at age {inputs.retirementAge}
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-neutral-900 dark:text-white">
              {money(final.total)}
            </div>
            <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              {money(yourPerCheck)} out of each paycheck, plus{" "}
              {money(matchPerCheck)} from the company.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              dotColor={color("contributions")}
              label="You put in"
              value={money(final.contributions)}
              sub={
                inputs.startingBalance > 0
                  ? `Includes your ${money(inputs.startingBalance)} starting balance`
                  : undefined
              }
            />
            <Stat
              dotColor={color("match")}
              label="Company match"
              value={money(final.match)}
              sub={`Free money at ${matchedPct}% of pay`}
            />
            <Stat
              dotColor={color("growth")}
              label="Investment growth"
              value={money(final.growth)}
              sub={`At ${inputs.returnPct}% per year`}
            />
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-4 flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-neutral-500" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                How it grows, age {inputs.currentAge} to {inputs.retirementAge}
              </h2>
            </div>
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={rows}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <defs>
                    {(Object.keys(SERIES) as (keyof typeof SERIES)[]).map(
                      (key) => (
                        <linearGradient
                          key={key}
                          id={`fill-${key}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={color(key)}
                            stopOpacity={0.75}
                          />
                          <stop
                            offset="100%"
                            stopColor={color(key)}
                            stopOpacity={0.35}
                          />
                        </linearGradient>
                      )
                    )}
                  </defs>
                  <CartesianGrid
                    stroke={gridColor}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="age"
                    tick={{ fill: axisColor, fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: gridColor }}
                    minTickGap={24}
                    label={{
                      value: "Age",
                      position: "insideBottomRight",
                      offset: -4,
                      fill: axisColor,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    tick={{ fill: axisColor, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={compact}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: axisColor, strokeDasharray: "3 3" }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="left"
                    height={32}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, color: axisColor }}
                  />
                  <Area
                    type="monotone"
                    dataKey="contributions"
                    name="Your contributions"
                    stackId="1"
                    stroke={color("contributions")}
                    strokeWidth={2}
                    fill="url(#fill-contributions)"
                  />
                  <Area
                    type="monotone"
                    dataKey="match"
                    name="Company match"
                    stackId="1"
                    stroke={color("match")}
                    strokeWidth={2}
                    fill="url(#fill-match)"
                  />
                  <Area
                    type="monotone"
                    dataKey="growth"
                    name="Investment growth"
                    stackId="1"
                    stroke={color("growth")}
                    strokeWidth={2}
                    fill="url(#fill-growth)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            {missingMatch ? (
              <p className="text-neutral-700 dark:text-neutral-200">
                At {inputs.contributionPct}% you are leaving part of the match on
                the table. Going to {MATCH_CAP_PCT}% costs you{" "}
                {moneyExact(
                  ((inputs.salary * ((MATCH_CAP_PCT - inputs.contributionPct) / 100)) /
                    periodsPerYear)
                )}{" "}
                more per paycheck and the company puts in the same amount for
                free.
              </p>
            ) : (
              <p className="text-neutral-700 dark:text-neutral-200">
                The match alone is worth{" "}
                <span className="font-semibold">
                  {money(final.total - finalNoMatch.total)}
                </span>{" "}
                of that balance. Without it you would retire with{" "}
                {money(finalNoMatch.total)}.
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Estimates only. Assumes contributions every pay period, a steady
              annual return compounded monthly, and no withdrawals, loans, or
              contribution limits. Real returns vary year to year.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
