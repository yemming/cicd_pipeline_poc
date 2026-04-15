"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

export interface HeatCell {
  date: string;      // YYYY-MM-DD
  value: number;     // 0–1 吉度
  label?: string;    // 該格要顯示的文字（例：日、初一、清明）
  color?: string;    // 自訂顏色，蓋過 value scale
  onClick?: () => void;
}

interface HeatmapProps {
  cells: HeatCell[];
  cellSize?: number;
  gap?: number;
  cols?: number;     // 預設 7 欄（週日–週六）
  activeDate?: string;
}

export function Heatmap({ cells, cellSize = 44, gap = 6, cols = 7, activeDate }: HeatmapProps) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const rows = Math.ceil(cells.length / cols);
    const w = cols * (cellSize + gap);
    const h = rows * (cellSize + gap);
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const color = d3.scaleLinear<string>()
      .domain([0, 0.5, 1])
      .range(["#f1f5f9", "#fde68a", "#F59E0B"]);

    const groups = svg
      .selectAll("g")
      .data(cells)
      .join("g")
      .attr(
        "transform",
        (_, i) => `translate(${(i % cols) * (cellSize + gap)},${Math.floor(i / cols) * (cellSize + gap)})`
      )
      .style("cursor", (d) => (d.onClick ? "pointer" : "default"))
      .on("click", (_, d) => d.onClick?.());

    groups
      .append("rect")
      .attr("width", cellSize)
      .attr("height", cellSize)
      .attr("rx", 8)
      .attr("fill", (d) => d.color ?? color(d.value))
      .attr("stroke", (d) => (d.date === activeDate ? "#CC0000" : "transparent"))
      .attr("stroke-width", 2)
      .attr("opacity", 0)
      .transition()
      .delay((_, i) => i * 20)
      .duration(300)
      .attr("opacity", 1);

    groups
      .append("text")
      .attr("x", cellSize / 2)
      .attr("y", cellSize / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("fill", (d) => (d.value > 0.6 ? "#78350f" : "#334155"))
      .text((d) => d.label ?? "");
  }, [cells, cellSize, gap, cols, activeDate]);

  return <svg ref={ref} style={{ width: "100%", maxWidth: 480 }} />;
}
