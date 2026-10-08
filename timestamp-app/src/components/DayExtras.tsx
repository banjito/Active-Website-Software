import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDayExtras, saveDayExtras } from '../lib/clock';
import { Colors, useColors } from '../theme';
import { CheckBox } from './ui';

// Per diem and miles for one day. Tracked so payroll can make sure they reach the paycheck.
export default function DayExtras({ workDate, jobcodeId }: { workDate: string; jobcodeId: number | null }) {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const [perDiem, setPerDiem] = useState(false);
  const [miles, setMiles] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getDayExtras(workDate)
      .then((extras) => {
        if (!live) return;
        setPerDiem(extras.per_diem);
        setMiles(extras.miles > 0 ? String(extras.miles) : '');
      })
      .catch((e) => console.error('[DayExtras] Load failed:', e));
    return () => {
      live = false;
    };
  }, [workDate]);

  const save = async (nextPerDiem: boolean, milesText: string) => {
    const amount = milesText.trim() === '' ? 0 : Number(milesText);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999) {
      setError('Miles must be a number');
      return;
    }
    setError('');
    try {
      await saveDayExtras(workDate, nextPerDiem, Math.round(amount * 10) / 10, jobcodeId);
    } catch (e: any) {
      console.error('[DayExtras] Save failed:', e);
      setError(e?.message ?? 'Could not save');
    }
  };

  const togglePerDiem = () => {
    const next = !perDiem;
    setPerDiem(next);
    save(next, miles);
  };

  return (
    <View>
      <View style={s.row}>
        <Pressable style={s.perDiem} onPress={togglePerDiem}>
          <CheckBox on={perDiem} />
          <Text style={s.text}>Per diem today</Text>
        </Pressable>
        <View style={s.miles}>
          <Text style={s.text}>Miles</Text>
          <TextInput
            style={s.input}
            value={miles}
            onChangeText={setMiles}
            onBlur={() => save(perDiem, miles)}
            onSubmitEditing={() => save(perDiem, miles)}
            placeholder="0"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    perDiem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    miles: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    text: { color: c.ink, fontSize: 15 },
    input: {
      width: 64,
      borderWidth: 1,
      borderColor: c.line2,
      color: c.ink,
      fontSize: 16,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 6,
      textAlign: 'right',
    },
    error: { color: c.no, marginTop: 6 },
  });
