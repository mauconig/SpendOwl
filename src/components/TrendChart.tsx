import React from 'react';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { t } from '../i18n';

const W = 336;
const H = 150;
const L = 8;
const R = 8;
const T = 16;
const B = 22;

function smooth(pts: [number, number][]) {
  const first = pts[0];
  if (!first) return '';
  let d = `M${first[0].toFixed(1)},${first[1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(i - 2, 0)]!;
    const p1 = pts[i - 1]!;
    const p2 = pts[i]!;
    const p3 = pts[Math.min(i + 1, pts.length - 1)]!;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * `series` is the running cumulative spend for each elapsed day of the month,
 * from GET /api/summary — it used to be the hardcoded TREND_CUR array. The
 * dashed line is the flat budget run-rate for comparison.
 */
export function TrendChart({
  series,
  daysInMonth,
  budget,
  monthLabel,
}: {
  series: number[];
  daysInMonth: number;
  budget: number;
  monthLabel: string;
}) {
  if (series.length === 0) return <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} />;

  // Headroom above whichever is taller: the budget line or actual spend.
  const maxY = Math.max(budget, ...series) * 1.12 || 1;
  const lastIndex = Math.max(daysInMonth - 1, 1);
  const X = (i: number) => L + ((W - L - R) * i) / lastIndex;
  const Y = (v: number) => T + (H - T - B) * (1 - v / maxY);

  const points: [number, number][] = series.map((v, i) => [X(i), Y(v)]);
  const d = smooth(points);
  const last = points[points.length - 1]!;
  const area = `${d}L${last[0].toFixed(1)},${H - B}L${L},${H - B}Z`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="soArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#78ADEE" stopOpacity={0.25} />
          <Stop offset="100%" stopColor="#78ADEE" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="soLine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#F0A878" />
          <Stop offset="55%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#78ADEE" />
        </LinearGradient>
      </Defs>
      <Line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="rgba(255,255,255,.08)" />
      <Path
        d={`M${X(0)},${Y(0)}L${X(lastIndex)},${Y(budget)}`}
        stroke="rgba(245,245,247,.3)"
        strokeWidth={1.5}
        strokeDasharray="4 5"
        fill="none"
      />
      <Path d={area} fill="url(#soArea)" />
      <Path d={d} stroke="url(#soLine)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill="#FFFFFF" />
      <SvgText x={L} y={H - 6} fontSize={10} fill="rgba(245,245,247,.4)">
        {monthLabel} 1
      </SvgText>
      <SvgText x={last[0]} y={last[1] - 11} fontSize={10} fill="#FFFFFF" textAnchor="middle" fontWeight="700">{t('Today')}</SvgText>
      <SvgText x={W - R} y={H - 6} fontSize={10} fill="rgba(245,245,247,.4)" textAnchor="end">
        {monthLabel} {daysInMonth}
      </SvgText>
    </Svg>
  );
}
