import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../icons';
import { CARD_COLORS } from '../store/constants';

/** A row of tappable swatches from the app's curated palette — never a free hue/hex picker. */
export function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {CARD_COLORS.map(color => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: color,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: selected ? 2 : 0,
              borderColor: '#FFFFFF',
            }}
          >
            {selected && <Icon name="check" size={16} color="#0A0A0B" />}
          </Pressable>
        );
      })}
    </View>
  );
}
