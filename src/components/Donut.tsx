import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { CATS, CatKey } from '../theme';

const R = 62;
const CIRC = 2 * Math.PI * R;

export type DonutSlice = { key: CatKey; amount: number };

/**
 * Slices are passed in rather than read from `CATS` — category totals are now
 * SUM()ed per user by GET /api/summary, not baked into the theme.
 */
export function Donut({
  slices,
  selCat,
  onSelect,
}: {
  slices: DonutSlice[];
  selCat: CatKey | null;
  onSelect: (c: CatKey | null) => void;
}) {
  const visible = slices.filter(s => s.amount > 0);
  const total = visible.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) return <Svg width={186} height={186} viewBox="0 0 180 180" />;

  let startPct = 0;
  return (
    <Svg width={186} height={186} viewBox="0 0 180 180" style={{ transform: [{ rotate: '-90deg' }] }}>
      <G>
        {visible.map(slice => {
          const cat = CATS[slice.key];
          const lenPct = (slice.amount / total) * 100;
          const isSel = selCat === slice.key;
          const segPct = Math.max(lenPct - 2.2, 1);
          const segLen = (segPct / 100) * CIRC;
          const offset = -(startPct / 100) * CIRC;
          startPct += lenPct;
          return (
            <Circle
              key={slice.key}
              cx={90}
              cy={90}
              r={R}
              fill="none"
              stroke={cat.color}
              strokeWidth={isSel ? 27 : 20}
              strokeDasharray={`${segLen} ${CIRC - segLen}`}
              strokeDashoffset={offset}
              opacity={selCat && !isSel ? 0.22 : 1}
              onPress={() => onSelect(isSel ? null : slice.key)}
            />
          );
        })}
      </G>
    </Svg>
  );
}
