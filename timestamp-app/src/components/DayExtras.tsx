import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDayExtras, saveDayExtras } from '../lib/clock';
import { Colors, useColors } from '../theme';
import { CheckBox } from './ui';

// Per diem and mileage for one day. Tracked so payroll can make sure they reach the paycheck.
// Mileage is two odometer readings; the database works out the miles from them.
export default function DayExtras({ workDate, jobcodeId }: { workDate: string; jobcodeId: number | null }) {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const [perDiem, setPerDiem] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  // Miles typed as one number before odometer readings existed
  const [earlierMiles, setEarlierMiles] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getDayExtras(workDate)
      .then((extras) => {
        if (!live) return;
        setPerDiem(extras.per_diem);
        setStart(extras.odometer_start == null ? '' : String(extras.odometer_start));
        setEnd(extras.odometer_end == null ? '' : String(extras.odometer_end));
        setEarlierMiles(extras.odometer_start == null && extras.odometer_end == null ? extras.miles : 0);
      })
      .catch((e) => console.error('[DayExtras] Load failed:', e));
    return () => {
      live = false;
    };
  }, [workDate]);

  // '' -> null, otherwise a reading to one decimal. undefined means it isn't a valid reading.
  const reading = (text: string): number | null | undefined => {
    if (text.trim() === '') return null;
    const n = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 999999.9) return undefined;
    return Math.round(n * 10) / 10;
  };

  const startNum = reading(start);
  const endNum = reading(end);
  const miles =
    typeof startNum === 'number' && typeof endNum === 'number' && endNum >= startNum
      ? Math.round((endNum - startNum) * 10) / 10
      : null;

  const save = async (nextPerDiem: boolean) => {
    if (startNum === undefined || endNum === undefined) {
      setError('Odometer readings must be numbers');
      return;
    }
    if (startNum != null && endNum != null && endNum < startNum) {
      setError('The end reading is lower than the start reading');
      return;
    }
    setError('');
    try {
      await saveDayExtras(workDate, nextPerDiem, startNum, endNum, jobcodeId);
    } catch (e: any) {
      console.error('[DayExtras] Save failed:', e);
      setError(e?.message ?? 'Could not save');
    }
  };

  const togglePerDiem = () => {
    const next = !perDiem;
    setPerDiem(next);
    save(next);
  };

  const odometerInput = (value: string, onChange: (t: string) => void, label: string) => (
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChange}
      onBlur={() => save(perDiem)}
      onSubmitEditing={() => save(perDiem)}
      placeholder={label}
      placeholderTextColor={c.muted}
      accessibilityLabel={`Odometer ${label.toLowerCase()}`}
      keyboardType="decimal-pad"
    />
  );

  return (
    <View>
      <View style={s.box}>
        <Pressable style={s.perDiem} onPress={togglePerDiem}>
          <CheckBox on={perDiem} />
          <Text style={s.text}>Per diem today</Text>
        </Pressable>
        <View style={s.odometer}>
          <Text style={s.text}>Odometer</Text>
          <View style={s.readings}>
            {odometerInput(start, setStart, 'Start')}
            {odometerInput(end, setEnd, 'End')}
          </View>
        </View>
        {miles != null ? (
          <Text style={s.note}>{miles} miles</Text>
        ) : earlierMiles > 0 ? (
          <Text style={s.note}>{earlierMiles} miles entered earlier</Text>
        ) : null}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    box: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    perDiem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    odometer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    readings: { flexDirection: 'row', gap: 8 },
    text: { color: c.ink, fontSize: 15 },
    note: { color: c.muted, fontSize: 13, textAlign: 'right' },
    input: {
      width: 96,
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
