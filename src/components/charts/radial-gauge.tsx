"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface RadialGaugeProps {
  value: number;       // 0–100
  max?: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}

/**
 * 半圓式車速表風格 gauge — D3 arc + 數字 count-up。
 */
export function RadialGauge({
  value,
  max = 100,
  label,
  sublabel,
  color = "#CC0000",
  size = 220,
}: RadialGaugeProps) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const w = size;
    const h = size * 0.62;
    const cx = w / 2;
    const cy = h;
    const outerR = w / 2 - 8;
    const innerR = outerR - 16;

    svg.attr("viewBox", `0 0 ${w} ${h + 10}`);

    const bgArc = d3
      .arc<unknown>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2)
      .cornerRadius(8);

    svg
      .append("path")
      .attr("d", bgArc({}) as string)
      .attr("fill", "#f1f5f9")
      .attr("transform", `translate(${cx},${cy})`);

    const pct = Math.max(0, Math.min(1, value / max));
    const targetEnd = -Math.PI / 2 + Math.PI * pct;

    const fgPath = svg
      .append("path")
      .attr("fill", color)
      .attr("transform", `translate(${cx},${cy})`);

    fgPath
      .transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .tween("arc", () => {
        const i = d3.interpolate(-Math.PI / 2, targetEnd);
        return (t) => {
          const arc = d3
            .arc<unknown>()
            .innerRadius(innerR)
            .outerRadius(outerR)
            .startAngle(-Math.PI / 2)
            .endAngle(i(t))
            .cornerRadius(8);
          fgPath.attr("d", arc({}) as string);
        };
      });

    // ticks
    const ticks = d3.range(0, max + 1, max / 10);
    svg
      .append("g")
      .selectAll("line")
      .data(ticks)
      .join("line")
      .attr("x1", (d) => {
        const a = -Math.PI / 2 + Math.PI * (d / max);
        return cx + Math.cos(a) * (innerR - 4);
      })
      .attr("y1", (d) => {
        const a = -Math.PI / 2 + Math.PI * (d / max);
        return cy + Math.sin(a) * (innerR - 4);
      })
      .attr("x2", (d) => {
        const a = -Math.PI / 2 + Math.PI * (d / max);
        return cx + Math.cos(a) * (innerR - 10);
      })
      .attr("y2", (d) => {
        const a = -Math.PI / 2 + Math.PI * (d / max);
        return cy + Math.sin(a) * (innerR - 10);
      })
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1);

    // value text
    const valText = svg
      .append("text")
      .attr("x", cx)
      .attr("y", cy - 16)
      .attr("text-anchor", "middle")
      .attr("font-family", "Manrope, sans-serif")
      .attr("font-weight", 800)
      .attr("font-size", 38)
      .attr("fill", color)
      .text("0");

    valText
      .transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .tween("text", () => {
        const i = d3.interpolateRound(0, Math.round(value));
        return (t) => valText.text(i(t));
      });

    // label
    svg
      .append("text")
      .attr("x", cx)
      .attr("y", cy + 8)
      .attr("text-anchor", "middle")
      .attr("font-family", "Manrope, sans-serif")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .attr("fill", "#475569")
      .attr("letter-spacing", "0.1em")
      .text(label.toUpperCase());

    if (sublabel) {
      svg
        .append("text")
        .attr("x", cx)
        .attr("y", cy + 22)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#94a3b8")
        .text(sublabel);
    }
  }, [value, max, label, sublabel, color, size]);

  return <svg ref={ref} width={size} height={size * 0.62 + 10} />;
}
