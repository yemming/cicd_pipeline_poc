"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

export interface RadarSeries {
  key: string;
  label: string;
  color: string;
  values: number[]; // aligned to axes[]
}

interface RadarChartProps {
  axes: string[];
  series: RadarSeries[];
  max?: number;
  size?: number;
}

export function RadarChart({ axes, series, max = 100, size = 340 }: RadarChartProps) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const w = size;
    const h = size;
    const cx = w / 2;
    const cy = h / 2;
    const r = size / 2 - 48;
    const n = axes.length;
    const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    // 背景同心圓
    const levels = 4;
    for (let l = 1; l <= levels; l++) {
      const lr = (r * l) / levels;
      svg
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", lr)
        .attr("fill", "none")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", l === levels ? "none" : "2 3")
        .attr("stroke-width", 1);
    }

    // 軸線 + 標籤
    axes.forEach((ax, i) => {
      const a = angleFor(i);
      svg
        .append("line")
        .attr("x1", cx)
        .attr("y1", cy)
        .attr("x2", cx + Math.cos(a) * r)
        .attr("y2", cy + Math.sin(a) * r)
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 1);

      svg
        .append("text")
        .attr("x", cx + Math.cos(a) * (r + 22))
        .attr("y", cy + Math.sin(a) * (r + 22))
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-family", "Manrope, sans-serif")
        .attr("font-size", 12)
        .attr("font-weight", 700)
        .attr("fill", "#475569")
        .text(ax);
    });

    // 各系列多邊形
    const lineGen = (vals: number[]) =>
      vals
        .map((v, i) => {
          const a = angleFor(i);
          const rr = (r * Math.min(v, max)) / max;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          return `${i === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ") + "Z";

    series.forEach((s, idx) => {
      const path = svg
        .append("path")
        .attr("fill", s.color)
        .attr("fill-opacity", 0.15)
        .attr("stroke", s.color)
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("d", lineGen(s.values.map(() => 0)));

      path
        .transition()
        .delay(idx * 150)
        .duration(900)
        .ease(d3.easeCubicOut)
        .attrTween("d", () => {
          const targetVals = s.values;
          return (t) => lineGen(targetVals.map((v) => v * t));
        });

      // 頂點
      s.values.forEach((v, i) => {
        const a = angleFor(i);
        const rr = (r * Math.min(v, max)) / max;
        svg
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 3.5)
          .attr("fill", s.color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5)
          .transition()
          .delay(idx * 150 + 700)
          .duration(300)
          .attr("cx", cx + Math.cos(a) * rr)
          .attr("cy", cy + Math.sin(a) * rr);
      });
    });
  }, [axes, series, max, size]);

  return <svg ref={ref} width={size} height={size} />;
}
