import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getQuickJobs, Job, jobParts, searchJobs } from '../lib/clock';
import { Colors, useColors } from '../theme';
import { CheckBox, Label } from './ui';

// Search box over a list. With nothing typed it shows recent jobs plus Shop and Training.
export default function JobPicker({
  recent,
  selected,
  onPick,
}: {
  recent: Job[];
  selected: Job | null;
  onPick: (job: Job) => void;
}) {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const [text, setText] = useState('');
  const [quick, setQuick] = useState<Job[]>([]);
  const [found, setFound] = useState<Job[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getQuickJobs()
      .then(setQuick)
      .catch((e) => console.error('[JobPicker] Quick jobs failed:', e));
  }, []);

  // Wait for a pause in typing so each letter isn't its own trip to the server
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const jobs = await searchJobs(text);
        if (live) {
          setFound(jobs);
          setError('');
        }
      } catch (e: any) {
        console.error('[JobPicker] Search failed:', e);
        if (live) setError(e?.message ?? 'Search failed');
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text]);

  const searching = text.trim().length >= 2;
  const idle = [...recent, ...quick.filter((q) => !recent.some((r) => r.qb_time_jobcode_id === q.qb_time_jobcode_id))];
  const jobs = searching ? found : idle;

  return (
    <View style={s.wrap}>
      <TextInput
        style={s.search}
        value={text}
        onChangeText={setText}
        placeholder="Search job number or name"
        placeholderTextColor={c.muted}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Label>{searching ? 'Jobs' : 'Recent jobs'}</Label>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <FlatList
        style={s.list}
        data={jobs}
        keyExtractor={(job) => String(job.qb_time_jobcode_id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={s.empty}>{searching ? 'No jobs found.' : 'Search to find your job.'}</Text>}
        renderItem={({ item }) => {
          const on = selected?.qb_time_jobcode_id === item.qb_time_jobcode_id;
          const parts = jobParts(item);
          return (
            <Pressable style={[s.row, on && s.rowOn]} onPress={() => onPick(item)}>
              <Text style={s.code}>{parts.code}</Text>
              <View style={s.names}>
                <Text style={s.title}>{parts.title}</Text>
                {item.customer_name ? <Text style={s.customer}>{item.customer_name}</Text> : null}
              </View>
              <CheckBox on={on} size={18} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    wrap: { flex: 1, gap: 10 },
    search: {
      borderWidth: 1,
      borderColor: c.line2,
      backgroundColor: c.bg,
      color: c.ink,
      fontSize: 16,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    error: { color: c.no },
    empty: { color: c.muted, padding: 14 },
    list: { borderWidth: 1, borderColor: c.line, flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.surface,
    },
    rowOn: { backgroundColor: c.brandWash },
    code: { width: 66, color: c.ink, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
    names: { flex: 1 },
    title: { color: c.ink2, fontSize: 15 },
    customer: { color: c.muted, fontSize: 12, marginTop: 1 },
  });
