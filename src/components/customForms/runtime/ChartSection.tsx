/**
 * A chart section on the form: plots a table's columns as readings come in.
 * Drawn with Recharts (as the built Tan Delta charts are), without animation so
 * print and PDF capture the finished chart.
 */

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as ChartIcon } from "lucide-react";
import type { SectionConfig } from "@/lib/types/customForms";
import type { SectionChrome } from "@/lib/customForms/runtime";
import {
  CHART_COLORS,
  DEFAULT_CHART,
  chartData,
  seriesKey,
  seriesLabel,
} from "@/lib/customForms/chart";

export const ChartSection: React.FC<{ section: SectionConfig; chrome: SectionChrome }> = ({ section, chrome }) => {
  const config = { ...DEFAULT_CHART, ...(section.chart ?? {}) };
  const sections = chrome.formSections?.() ?? [section];
  const formData = (chrome.conditionValues?.() ?? {}) as Record<string, Record<string, any>>;
  const { points, numericX, source } = chartData(config, sections, formData);
  const height = config.height ?? 260;
  const xLabel = config.xLabel || source?.columns?.[(config.xColumn ?? 1) - 1]?.label || "";

  if (!points.length) {
    // Shown outside a form (the component editor): it can't look the table up yet.
    const standalone = !chrome.formSections;
    const what = standalone
      ? config.source
        ? `Plots table ${config.source} on the form it is added to.`
        : "Give the table's reference code in the settings above."
      : !config.source
      ? "Choose a table to chart in this component's settings."
      : !source
        ? `No table with reference code "${config.source}" on this form.`
        : !config.xColumn || !config.series.length
          ? "Choose the columns to plot in this component's settings."
          : "The chart appears as readings are entered.";
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-600 text-xs text-neutral-500 dark:text-neutral-400 print:hidden"
        style={{ height: Math.min(height, 160) }}
      >
        <ChartIcon className="w-5 h-5" />
        {what}
      </div>
    );
  }

  const logY = config.yScale === "log";
  const xAxis = (
    <XAxis
      dataKey="x"
      type={numericX ? "number" : "category"}
      domain={numericX ? ["dataMin", "dataMax"] : undefined}
      allowDuplicatedCategory={false}
      tick={{ fontSize: 10 }}
      label={xLabel ? { value: xLabel, position: "insideBottom", offset: -4, fontSize: 10 } : undefined}
    />
  );
  // Dots need a number line across the bottom; text x values draw as a line chart.
  const type = config.type === "scatter" && !numericX ? "line" : config.type;
  const yAxis = (
    <YAxis
      dataKey={type === "scatter" ? "y" : undefined}
      type="number"
      scale={logY ? "log" : "auto"}
      domain={logY ? ["auto", "auto"] : undefined}
      allowDataOverflow={logY}
      tick={{ fontSize: 10 }}
      width={48}
      label={
        config.yLabel ? { value: config.yLabel, angle: -90, position: "insideLeft", fontSize: 10 } : undefined
      }
    />
  );
  // Log scales can't show zero or less; those points are left out.
  const data = logY
    ? points.map((p) => {
        const out = { ...p };
        config.series.forEach((_, i) => {
          const v = out[seriesKey(i)];
          if (typeof v === "number" && v <= 0) out[seriesKey(i)] = null;
        });
        return out;
      })
    : points;
  const color = (i: number) => config.series[i].color || CHART_COLORS[i % CHART_COLORS.length];
  const common = { data, margin: { top: 8, right: 16, bottom: 16, left: 4 } };
  const extras = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
      {xAxis}
      {yAxis}
      <Tooltip wrapperClassName="print:hidden" />
      {config.series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
    </>
  );

  return (
    <div className="w-full print:break-inside-avoid" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar" ? (
          <BarChart {...common}>
            {extras}
            {config.series.map((s, i) => (
              <Bar key={i} dataKey={seriesKey(i)} name={seriesLabel(s, source)} fill={color(i)} isAnimationActive={false} />
            ))}
          </BarChart>
        ) : type === "scatter" ? (
          <ScatterChart {...common}>
            {extras}
            {config.series.map((s, i) => (
              <Scatter
                key={i}
                // Each series as its own {x, y} points against one y axis.
                data={data
                  .filter((p) => p[seriesKey(i)] != null)
                  .map((p) => ({ x: p.x, y: p[seriesKey(i)] }))}
                name={seriesLabel(s, source)}
                fill={color(i)}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        ) : (
          <LineChart {...common}>
            {extras}
            {config.series.map((s, i) => (
              <Line
                key={i}
                type="linear"
                dataKey={seriesKey(i)}
                name={seriesLabel(s, source)}
                stroke={color(i)}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartSection;
