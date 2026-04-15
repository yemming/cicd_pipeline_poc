"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

export interface LinePoint {
  x: number | string;
  y: number;
}

interface LineAreaProps {
  data: LinePoint[];
  color?: string;
  height?: number;
  width?: number;
  yFormat?: (v: number) => string;
  xLabel?: (p: LinePoint) => string;
  highlightIndex?: number;
}

export function LineArea({
  data,
  color = "#CC0000",
  height = 200,
  width = 560,
  yFormat = (v) => v.toString(),
  xLabel = (p) => String(p.x),
  highlightIndex,
}: LineAreaProps) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const m = { t: 20, r: 20, b: 36, l: 48 };
    const w = width - m.l - m.r;
    const h = height - m.t - m.b;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    const x = d3
      .scalePoint<number>()
      .domain(data.map((_, i) => i))
      .range([0, w])
      .padding(0.2);

    const yMin = d3.min(data, (d) => d.y) ?? 0;
    const yMax = d3.max(data, (d) => d.y) ?? 0;
    const yPad = (yMax - yMin) * 0.1;
    const y = d3
      .scaleLinear()
      .domain([Math.max(0, yMin - yPad), yMax + yPad])
      .range([h, 0]);

    // gradient
    const gradId = `lineGrad-${Math.random().toString(36).slice(2, 8)}`;
    const grad = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.35);
    grad.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);

    // gridlines
    y.ticks(4).forEach((tv) => {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", w)
        .attr("y1", y(tv))
        .attr("y2", y(tv))
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "2 3");
      g.append("text")
        .attr("x", -8)
        .attr("y", y(tv) + 4)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .attr("fill", "#94a3b8")
        .text(yFormat(tv));
    });

    // x labels — 抽樣避免擁擠
    const labelStep = Math.ceil(data.length / 6);
    data.forEach((d, i) => {
      if (i % labelStep !== 0 && i !== data.length - 1) return;
      g.append("text")
        .attr("x", x(i) ?? 0)
        .attr("y", h + 22)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#94a3b8")
        .text(xLabel(d));
    });

    const area = d3
      .area<LinePoint>()
      .x((_, i) => x(i) ?? 0)
      .y0(h)
      .y1((d) => y(d.y))
      .curve(d3.curveMonotoneX);

    const line = d3
      .line<LinePoint>()
      .x((_, i) => x(i) ?? 0)
      .y((d) => y(d.y))
      .curve(d3.curveMonotoneX);

    const areaPath = g
      .append("path")
      .datum(data)
      .attr("fill", `url(#${gradId})`)
      .attr("d", area as unknown as string);

    const linePath = g
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2.5)
      .attr("stroke-linejoin", "round")
      .attr("d", line as unknown as string);

    const totalLen = (linePath.node() as SVGPathElement | null)?.getTotalLength() ?? 0;
    linePath
      .attr("stroke-dasharray", `${totalLen} ${totalLen}`)
      .attr("stroke-dashoffset", totalLen)
      .transition()
      .duration(1100)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    areaPath.attr("opacity", 0).transition().delay(400).duration(700).attr("opacity", 1);

    // points
    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (_, i) => x(i) ?? 0)
      .attr("cy", (d) => y(d.y))
      .attr("r", (_, i) => (i === highlightIndex ? 6 : 3))
      .attr("fill", (_, i) => (i === highlightIndex ? "#fff" : color))
      .attr("stroke", color)
      .attr("stroke-width", (_, i) => (i === highlightIndex ? 3 : 1))
      .attr("opacity", 0)
      .transition()
      .delay((_, i) => 600 + i * 30)
      .duration(200)
      .attr("opacity", 1);
  }, [data, color, height, width, yFormat, xLabel, highlightIndex]);

  return <svg ref={ref} width={width} height={height} style={{ maxWidth: "100%", height: "auto" }} />;
}
