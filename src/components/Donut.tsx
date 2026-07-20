import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { CATS, CatKey } from '../theme';

const BASE_KEYS: CatKey[] = ['food', 'bills', 'shopping', 'transport'];
const BASE_TOTAL = 1116.35;
const R = 62;
const CIRC = 2 * Math.PI * R;

export function Donut({ selCat, onSelect, extra }: { selCat: CatKey | null; onSelect: (c: CatKey | null) => void; extra?: { amount: number } }) {
  const hasExtra = !!extra && extra.amount > 0;
  const keys = hasExtra ? [...BASE_KEYS, 'debt' as CatKey] : BASE_KEYS;
  const total = BASE_TOTAL + (hasExtra ? extra!.amount : 0);
  const amountFor = (k: CatKey) => (k === 'debt' ? extra!.amount : CATS[k].amount);

  let startPct = 0;
  return (
    <Svg width={186} height={186} viewBox="0 0 180 180" style={{ transform: [{ rotate: '-90deg' }] }}>
      <G>
        {keys.map(k => {
          const c = CATS[k];
          const lenPct = (amountFor(k) / total) * 100;
          const isSel = selCat === k;
          const segPct = Math.max(lenPct - 2.2, 1);
          const segLen = (segPct / 100) * CIRC;
          const offset = -(startPct / 100) * CIRC;
          startPct += lenPct;
          return (
            <Circle
              key={k}
              cx={90}
              cy={90}
              r={R}
              fill="none"
              stroke={c.color}
              strokeWidth={isSel ? 27 : 20}
              strokeDasharray={`${segLen} ${CIRC - segLen}`}
              strokeDashoffset={offset}
              opacity={selCat && !isSel ? 0.22 : 1}
              onPress={() => onSelect(isSel ? null : k)}
            />
          );
        })}
      </G>
    </Svg>
  );
}
