import uPlot, { type AlignedData } from 'uplot';
import { count, formatResult } from '../../lib/format.ts';
import { averageSeconds, type Result, singleSeconds } from '../../lib/stats.ts';
import { Chart, plainAxis, timeAxis } from './Chart.tsx';
import type { ChartData, ProgressPoint, Rolling, SessionBox, SolvePoint } from './data.ts';

/*
 * The four charts, as on the 3.x desktop app's Analytics tab: progress, how times spread out, rolling
 * averages, and consistency across sessions. Each says in words what it shows (web/js/charts.js).
 */

const single = (ms: Result) => singleSeconds(ms);
const average = (ms: Result) => averageSeconds(ms);

function shortDate(iso: string): string {
  return iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
    : '';
}

function line(colour: string, width = 2, dash?: number[]): uPlot.Series {
  return { stroke: colour, width, ...(dash ? { dash } : {}), points: { show: false } };
}

function dots(colour: string, size = 4): uPlot.Series {
  return {
    stroke: colour,
    paths: () => null,
    points: { show: true, size, fill: colour, stroke: colour, width: 0 },
  };
}

function linePoints(colour: string): uPlot.Series {
  return {
    stroke: colour,
    width: 2,
    points: { show: true, size: 5, fill: colour, stroke: colour },
  };
}

const numbered = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Whole numbers only on an axis of sessions or solves, as there's no session 1.5. */
const wholeSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

const lowest = (values: readonly (number | null)[]) => {
  const done = values.filter((v): v is number => v !== null);
  return done.length ? Math.min(...done) : null;
};

export function Charts({
  data,
  wholeEvent,
}: {
  readonly data: ChartData;
  readonly wholeEvent: boolean;
}) {
  return (
    <div className="space-y-4">
      {data.progress.length === 0 ? (
        <Empty
          title="Progress"
          text={
            wholeEvent ? 'Needs a session with 5 solves or more.' : 'No solves in this session yet.'
          }
        />
      ) : wholeEvent ? (
        <EventProgress points={data.progress as ProgressPoint[]} />
      ) : (
        <SessionProgress points={data.progress as SolvePoint[]} />
      )}
      {data.distribution.length === 0 ? (
        <Empty title="How your times spread out" text="Needs 5 solves or more." />
      ) : (
        <Distribution times={data.distribution} />
      )}
      {data.rolling === null ? (
        <Empty title="Rolling averages" text="Needs 12 solves or more." />
      ) : (
        <RollingAverages rolling={data.rolling} />
      )}
      {wholeEvent &&
        (data.consistency === null ? (
          <Empty
            title="Consistency across sessions"
            text="Needs 2 sessions with 5 solves or more."
          />
        ) : (
          <Consistency boxes={data.consistency} />
        ))}
    </div>
  );
}

function Empty({ title, text }: { readonly title: string; readonly text: string }) {
  return (
    <section className="rounded-xl border border-line bg-raised p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-muted text-sm">{text}</p>
    </section>
  );
}

function EventProgress({ points }: { readonly points: ProgressPoint[] }) {
  const best = points.map((p) => single(p.best));
  const mean = points.map((p) => average(p.mean));
  const ao5 = points.map((p) => average(p.ao5));
  const first = points[0] as ProgressPoint;
  const last = points.at(-1) as ProgressPoint;
  const ao5s = ao5.filter((v): v is number => v !== null);
  let summary = `${count(points.length, 'session', 'sessions')}, from ${shortDate(first.label)} to ${shortDate(last.label)}.`;
  if (ao5s.length >= 2)
    summary += ` The last Ao5 went from ${formatResult(ao5s[0] as number)} to ${formatResult(ao5s.at(-1) as number)}.`;
  const fastest = lowest(best);
  if (fastest !== null) {
    const at = points[best.indexOf(fastest)] as ProgressPoint;
    summary += ` Best single ${formatResult(fastest)}, on ${shortDate(at.label)}.`;
  }
  const data: AlignedData = [numbered(points.length), best, mean, ao5];
  return (
    <Chart
      title="Progress"
      summary={summary}
      data={data}
      legend={(c) => [
        { name: 'Best single', colour: c.lines[0] },
        { name: 'Session mean', colour: c.lines[1] },
        { name: 'Last Ao5', colour: c.lines[2] },
      ]}
      options={(c) => ({
        scales: { x: { time: false } },
        axes: [
          {
            ...plainAxis(c),
            incrs: wholeSteps,
            values: (_, ticks) => ticks.map((t) => shortDate(points[t - 1]?.label ?? '')),
          },
          timeAxis(c),
        ],
        series: [{}, linePoints(c.lines[0]), linePoints(c.lines[1]), linePoints(c.lines[2])],
      })}
    />
  );
}

function SessionProgress({ points }: { readonly points: SolvePoint[] }) {
  const times = points.map((p) => single(p.time));
  const mean = points.map((p) => average(p.mean));
  const ao5 = points.map((p) => average(p.ao5));
  const first = points[0] as SolvePoint;
  const last = points.at(-1) as SolvePoint;
  const parts = [`Solves ${first.solveNumber} to ${last.solveNumber} of this session`];
  const fastest = lowest(times);
  if (fastest !== null) parts.push(`fastest ${formatResult(fastest)}`);
  const lastMean = mean.at(-1);
  if (lastMean != null) parts.push(`mean ${formatResult(lastMean)}`);
  if (points.length >= 5)
    parts.push(`latest Ao5 ${ao5.at(-1) == null ? 'a DNF' : formatResult(ao5.at(-1) as number)}`);
  const dnfs = times.filter((t) => t === null).length;
  if (dnfs) parts.push(count(dnfs, 'DNF', 'DNFs'));
  return (
    <Chart
      title="Progress"
      summary={`${parts.join(', ')}.`}
      data={[points.map((p) => p.solveNumber), times, mean, ao5]}
      legend={(c) => [
        { name: 'Time', colour: c.lines[0], dots: true },
        { name: 'Running mean', colour: c.lines[1], dashed: true },
        { name: 'Ao5', colour: c.lines[2] },
      ]}
      options={(c) => ({
        scales: { x: { time: false } },
        axes: [{ ...plainAxis(c), incrs: wholeSteps }, timeAxis(c)],
        series: [{}, dots(c.lines[0]), line(c.lines[1], 2, [6, 4]), line(c.lines[2])],
      })}
    />
  );
}

function Distribution({ times }: { readonly times: number[] }) {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, t) => sum + t, 0) / n;
  const middle = Math.floor(n / 2);
  const median =
    n % 2
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  const sd = Math.sqrt(sorted.reduce((sum, t) => sum + (t - mean) ** 2, 0) / n);

  // As many bars as the desktop chart: between 10 and 40, about one for every 5 solves.
  const bins = Math.min(40, Math.max(10, Math.floor(n / 5)));
  const low = sorted[0] as number;
  const high = sorted.at(-1) as number;
  const width = (high - low) / bins || 1;
  const counts = new Array<number>(bins).fill(0);
  for (const t of sorted) {
    const bin = Math.min(bins - 1, Math.floor((t - low) / width));
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  const bars = uPlot.paths.bars?.({ size: [0.92, Number.POSITIVE_INFINITY] });
  const centres = counts.map((_, i) => low + width * (i + 0.5));

  const summary =
    `How ${count(n, 'solve', 'solves')} spread out: fastest ${formatResult(low)}, median ${formatResult(median)}, ` +
    `mean ${formatResult(mean)}, and slowest ${formatResult(high)}. The standard deviation is ${sd.toFixed(2)} seconds.`;
  return (
    <Chart
      title="How your times spread out"
      summary={summary}
      data={[centres, counts]}
      legend={(c) => [
        { name: 'Solves', colour: c.lines[0] },
        { name: 'Median', colour: c.danger, dashed: true },
      ]}
      options={(c) => ({
        scales: {
          x: { time: false, range: [low - width / 2, high + width / 2] },
          y: { range: (_, __, max) => [0, max * 1.1] },
        },
        axes: [
          timeAxis({ ...c, grid: 'transparent' }),
          plainAxis(c, (v) => (Number.isInteger(v) ? String(v) : '')),
        ],
        series: [
          {},
          {
            stroke: c.lines[0],
            fill: c.lines[0],
            ...(bars ? { paths: bars } : {}),
            points: { show: false },
          },
        ],
        hooks: {
          draw: [
            (u) => {
              const x = u.valToPos(median, 'x', true);
              const { ctx } = u;
              ctx.save();
              ctx.strokeStyle = c.danger;
              ctx.lineWidth = 2 * devicePixelRatio;
              ctx.setLineDash([6 * devicePixelRatio, 4 * devicePixelRatio]);
              ctx.beginPath();
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();
              ctx.restore();
            },
          ],
        },
      })}
    />
  );
}

function RollingAverages({ rolling }: { readonly rolling: Rolling }) {
  const times = rolling.times.map(single);
  const ao5 = rolling.ao5.map(average);
  const ao12 = rolling.ao12.map(average);
  const describe = (name: string, values: (number | null)[]) => {
    const best = lowest(values);
    if (best === null) return null;
    const now = values.at(-1);
    return `${name} now ${now == null ? 'a DNF' : formatResult(now)}, best ${formatResult(best)}`;
  };
  const parts = [describe('Ao5', ao5), describe('Ao12', ao12)].filter(Boolean);
  return (
    <Chart
      title="Rolling averages"
      summary={`The last ${count(times.length, 'solve', 'solves')}${parts.length ? `: ${parts.join('; ')}` : ''}.`}
      data={[numbered(times.length), times, ao5, ao12]}
      legend={(c) => [
        { name: 'Solves', colour: c.dots, dots: true },
        { name: 'Rolling Ao5', colour: c.lines[0] },
        { name: 'Rolling Ao12', colour: c.lines[1] },
      ]}
      options={(c) => ({
        scales: { x: { time: false } },
        axes: [{ ...plainAxis(c), incrs: wholeSteps }, timeAxis(c)],
        series: [{}, dots(c.dots, 3), line(c.lines[0]), line(c.lines[1])],
      })}
    />
  );
}

function Consistency({ boxes }: { readonly boxes: SessionBox[] }) {
  const medians = boxes.map((b) => b.median);
  const steadiest = [...boxes].sort((a, b) => a.q3 - a.q1 - (b.q3 - b.q1))[0] as SessionBox;
  const summary =
    `How spread out your times were in the last ${count(boxes.length, 'session', 'sessions')}. ` +
    `Median times ranged from ${formatResult(Math.min(...medians))} to ${formatResult(Math.max(...medians))}. ` +
    `The steadiest was on ${shortDate(steadiest.date ?? '')}, with the middle half of its solves within ` +
    `${(steadiest.q3 - steadiest.q1).toFixed(2)} seconds of each other.`;
  const low = Math.min(...boxes.map((b) => b.lowerfence));
  const high = Math.max(...boxes.map((b) => b.upperfence));
  const pad = (high - low) * 0.08 || 1;
  return (
    <Chart
      title="Consistency across sessions"
      summary={summary}
      data={[numbered(boxes.length), medians]}
      legend={(c) => [
        { name: 'Middle half of the solves', colour: c.lines[1] },
        { name: 'Median', colour: c.lines[0] },
      ]}
      options={(c) => ({
        scales: {
          x: { time: false, range: [0.4, boxes.length + 0.6] },
          y: { range: [low - pad, high + pad] },
        },
        axes: [
          {
            ...plainAxis(c),
            incrs: [1, 2, 5],
            space: 36,
            values: (_, ticks) => ticks.map((t) => shortDate(boxes[t - 1]?.date ?? '')),
          },
          timeAxis(c),
        ],
        series: [{}, { stroke: 'transparent', paths: () => null, points: { show: false } }],
        hooks: {
          draw: [
            (u) => {
              const { ctx } = u;
              const ratio = devicePixelRatio;
              const half = Math.min(18, u.bbox.width / boxes.length / 2 / ratio - 4) * ratio;
              ctx.save();
              boxes.forEach((box, i) => {
                const x = u.valToPos(i + 1, 'x', true);
                const y = (value: number) => u.valToPos(value, 'y', true);
                // Whiskers
                ctx.strokeStyle = c.text;
                ctx.lineWidth = 1.5 * ratio;
                ctx.beginPath();
                ctx.moveTo(x, y(box.lowerfence));
                ctx.lineTo(x, y(box.q1));
                ctx.moveTo(x, y(box.q3));
                ctx.lineTo(x, y(box.upperfence));
                ctx.moveTo(x - half / 2, y(box.lowerfence));
                ctx.lineTo(x + half / 2, y(box.lowerfence));
                ctx.moveTo(x - half / 2, y(box.upperfence));
                ctx.lineTo(x + half / 2, y(box.upperfence));
                ctx.stroke();
                // The middle half
                ctx.strokeStyle = c.lines[1];
                ctx.lineWidth = 2 * ratio;
                ctx.strokeRect(x - half, y(box.q3), half * 2, y(box.q1) - y(box.q3));
                // The median
                ctx.strokeStyle = c.lines[0];
                ctx.lineWidth = 3 * ratio;
                ctx.beginPath();
                ctx.moveTo(x - half, y(box.median));
                ctx.lineTo(x + half, y(box.median));
                ctx.stroke();
              });
              ctx.restore();
            },
          ],
        },
      })}
    />
  );
}
