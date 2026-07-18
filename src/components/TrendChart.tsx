import React from 'react';
import Svg, { Defs, LinearGradient, Line, Path, Circle, Stop, Text as SvgText } from 'react-native-svg';
import { TREND_CUR } from '../store/mockData';

const W = 336;
const H = 150;
const L = 8;
const R = 8;
const T = 16;
const B = 22;
const MAX_Y = 2700;

function X(i: number) {
  return L + ((W - L - R) * i) / 30;
}
function Y(v: number) {
  return T + (H - T - B) * (1 - v / MAX_Y);
}

function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(i - 2, 0)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(i + 1, pts.length - 1)];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function TrendChart() {
  const p: [number, number][] = TREND_CUR.map((v, i) => [X(i), Y(v)]);
  const d = smooth(p);
  const last = p[p.length - 1];
  const area = `${d}L${last[0].toFixed(1)},${H - B}L${L},${H - B}Z`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="soArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#4DF0B8" stopOpacity={0.22} />
          <Stop offset="100%" stopColor="#4DF0B8" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="rgba(255,255,255,.08)" />
      <Path d={`M${X(0)},${Y(0)}L${X(30)},${Y(2560)}`} stroke="rgba(233,237,242,.32)" strokeWidth={1.5} strokeDasharray="4 5" fill="none" />
      <Path d={area} fill="url(#soArea)" />
      <Path d={d} stroke="#4DF0B8" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill="#4DF0B8" />
      <SvgText x={L} y={H - 6} fontSize={10} fill="rgba(233,237,242,.45)">
        JUL 1
      </SvgText>
      <SvgText x={last[0]} y={last[1] - 11} fontSize={10} fill="#4DF0B8" textAnchor="middle">
        TODAY
      </SvgText>
      <SvgText x={W - R} y={H - 6} fontSize={10} fill="rgba(233,237,242,.45)" textAnchor="end">
        JUL 31
      </SvgText>
    </Svg>
  );
}
