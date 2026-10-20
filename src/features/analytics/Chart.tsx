import { useEffect, useRef, useState } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatClock } from '../../lib/format.ts';
import { onThemeChange } from '../../lib/theme.ts';

/** The app's chart colours (index.css), read when a chart is drawn, so they follow the theme. */
export interface ChartColours {
  readonly lines: readonly [string, string, string, string];
  readonly dots: string;
  readonly grid: string;
  readonly text: string;
  readonly danger: string;
}

function readColours(): ChartColours {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    lines: [token('--chart-1'), token('--chart-2'), token('--chart-3'), token('--chart-4')],
    dots: token('--chart-dots'),
    grid: token('--chart-grid'),
    text: token('--muted'),
    danger: token('--danger-ink'),
  };
}

/** Redraws when the app switches between light and dark, by choice or with the phone. */
function useColours(): ChartColours {
  const [colours, setColours] = useState(readColours);
  useEffect(() => onThemeChange(() => setColours(readColours())), []);
  return colours;
}

/** A time axis in seconds, labelled as cubers write times (12.34, 1:23.45). */
export function timeAxis(colours: ChartColours): uPlot.Axis {
  return {
    stroke: colours.text,
    grid: { stroke: colours.grid, width: 1 },
    ticks: { show: false },
    font: '12px "Space Grotesk", system-ui, sans-serif',
    size: 52,
    values: (_, ticks) => ticks.map((tick) => formatClock(tick)),
  };
}

export function plainAxis(colours: ChartColours, label?: (value: number) => string): uPlot.Axis {
  return {
    stroke: colours.text,
    grid: { show: false },
    ticks: { show: false },
    font: '12px "Space Grotesk", system-ui, sans-serif',
    ...(label ? { values: (_: uPlot, ticks: number[]) => ticks.map(label) } : {}),
  };
}

export interface LegendItem {
  readonly name: string;
  readonly colour: string;
  readonly dashed?: boolean;
  readonly dots?: boolean;
}

/**
 * A chart drawn by uPlot. The drawing is hidden from screen readers; `summary`, shown beneath it,
 * says in words what it shows, worked out from the same numbers.
 */
export function Chart({
  title,
  summary,
  data,
  options,
  legend,
  height = 220,
}: {
  readonly title: string;
  readonly summary: string;
  readonly data: AlignedData;
  readonly options: (colours: ChartColours) => Omit<Options, 'width' | 'height'>;
  readonly legend: (colours: ChartColours) => readonly LegendItem[];
  readonly height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const colours = useColours();
  const build = useRef(options);
  build.current = options;
  const latest = useRef(data);
  latest.current = data;
  // Redraw only when the numbers change, not each time the parent works them out again.
  const fingerprint = JSON.stringify(data);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the fingerprint stands in for data, read through latest.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const plot = new uPlot(
      {
        ...build.current(colours),
        width: element.clientWidth,
        height,
        legend: { show: false },
        cursor: { show: false },
      },
      latest.current,
      element,
    );
    const resize = new ResizeObserver(() => plot.setSize({ width: element.clientWidth, height }));
    resize.observe(element);
    return () => {
      resize.disconnect();
      plot.destroy();
    };
  }, [fingerprint, colours, height]);

  return (
    <figure className="rounded-xl border border-line bg-raised p-4">
      <figcaption className="font-semibold">{title}</figcaption>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted text-sm">
        {legend(colours).map((item) => (
          <li key={item.name} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={item.dots ? 'size-2 rounded-full' : 'h-0.5 w-4'}
              style={
                item.dashed
                  ? { borderTop: `2px dashed ${item.colour}` }
                  : { backgroundColor: item.colour }
              }
            />
            {item.name}
          </li>
        ))}
      </ul>
      <div ref={container} aria-hidden="true" className="mt-2 w-full" />
      <p className="mt-2 text-muted text-sm">{summary}</p>
    </figure>
  );
}
