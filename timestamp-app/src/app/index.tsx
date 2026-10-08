import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DayExtras from '../components/DayExtras';
import JobPicker from '../components/JobPicker';
import { ScreenIn, smooth } from '../components/Motion';
import { CheckBox, Label, OutlineButton, PrimaryButton } from '../components/ui';
import { isOffToday, setOffToday, syncAlarms } from '../lib/alarms';
import {
  clockIn,
  clockOut,
  Entry,
  entryJob,
  getMyDay,
  Job,
  jobParts,
  MyDay,
  switchJob,
  today,
} from '../lib/clock';
import { Colors, useColors } from '../theme';

const pad = (n: number) => String(n).padStart(2, '0');
const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%` as `${number}%`;
const parts = (d: Date) => ({ time: `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`, half: d.getHours() >= 12 ? 'PM' : 'AM' });
const clockTime = (iso: string) => {
  const t = parts(new Date(iso));
  return `${t.time} ${t.half}`;
};
// "3:47" on the clock
const elapsed = (fromIso: string, now: Date) => {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}:${pad(mins % 60)}`;
};
// Clock in rounds back to the quarter hour. Only for show: the database does the real rounding.
const countsAs = (now: Date) => {
  const d = new Date(now);
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0);
  const t = parts(d);
  return `${t.time} ${t.half}`;
};

// Today as a strip: orange where time was counted
function DayBar({ entries, now, c }: { entries: Entry[]; now: Date; c: Colors }) {
  const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;
  const spans = entries.map((e) => ({
    id: e.id,
    from: hourOf(new Date(e.counted_in_at)),
    to: hourOf(e.counted_out_at ? new Date(e.counted_out_at) : now),
  }));
  // 6 AM to 6 PM unless the day runs outside that
  const wide = spans.some((x) => x.from < 6 || x.to > 18 || x.to < x.from);
  const start = wide ? 0 : 6;
  const length = wide ? 24 : 12;
  const at = (hour: number) => ((hour - start) / length) * 100;

  return (
    <View>
      <View style={{ height: 20, backgroundColor: c.sunk, borderWidth: 1, borderColor: c.line, marginTop: 6 }}>
        {spans.map((x) => {
          const end = x.to < x.from ? start + length : x.to;
          return (
            <View
              key={x.id}
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(at(x.from)), width: pct(Math.max(1, at(end) - at(x.from))), backgroundColor: c.brand }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
        {(wide ? ['12a', '6a', '12p', '6p', '12a'] : ['6a', '9a', '12p', '3p', '6p']).map((label, i) => (
          <Text key={i} style={{ fontSize: 10, color: c.muted }}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// The clock: in, lunch, switch job, out
export default function Clock() {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const [day, setDay] = useState<MyDay | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [off, setOff] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Keeps the big clock and the timer moving
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getMyDay();
      // Clocking in or out swaps most of the screen. Ease it.
      smooth();
      setDay(next);
      setNow(new Date());
      setOff(await isOffToday());
      // Most days it's the same job as last time, so start there
      setJob((current) => current ?? entryJob(next.last));
      // Not awaited: the alarms set themselves in the background
      syncAlarms(next);
    } catch (e: any) {
      console.error('[Clock] Load failed:', e);
      setMessage(e?.message ?? 'Could not load your day');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The database owns the rules. Its message says what went wrong.
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setSwitching(false);
      await refresh();
    } catch (e: any) {
      console.error('[Clock] Punch failed:', e);
      setMessage(e?.message ?? 'That did not go through');
    } finally {
      setBusy(false);
    }
  };

  const toggleOff = async () => {
    await setOffToday(!off);
    await refresh();
  };

  if (!day) {
    return (
      <ScreenIn from="left">
        <View style={s.screen}>
          {message ? <Text style={s.message}>{message}</Text> : <ActivityIndicator color={c.brand} style={s.loading} />}
        </View>
      </ScreenIn>
    );
  }

  const open = day.open;
  const shiftJob = open ? entryJob(open) : day.atLunch ? entryJob(day.last) : null;
  const shiftDate = open?.work_date ?? (day.atLunch && day.last ? day.last.work_date : today());
  const nowParts = parts(now);

  const status = open ? (
    <View style={[s.status, s.statusIn]}>
      <View style={s.statusLabel}>
        <View style={[s.dot, { backgroundColor: c.ok }]} />
        <Text style={s.statusText}>Clocked in</Text>
      </View>
      <Text style={s.big}>{elapsed(open.counted_in_at, now)}</Text>
      <Text style={s.sub}>
        Since {clockTime(open.counted_in_at)}. Real punch {clockTime(open.clock_in_at)}.
      </Text>
    </View>
  ) : day.atLunch && day.last?.clock_out_at ? (
    <View style={[s.status, s.statusIn]}>
      <View style={s.statusLabel}>
        <View style={[s.dot, { backgroundColor: c.brand }]} />
        <Text style={s.statusText}>At lunch</Text>
      </View>
      <Text style={s.big}>{elapsed(day.last.clock_out_at, now)}</Text>
      <Text style={s.sub}>Since {clockTime(day.last.clock_out_at)}. Lunch is 30 minutes.</Text>
    </View>
  ) : (
    <View style={s.status}>
      <View style={s.statusLabel}>
        <View style={[s.dot, { backgroundColor: c.muted }]} />
        <Text style={s.statusText}>Clocked out</Text>
      </View>
      <Text style={s.big}>
        {nowParts.time}
        <Text style={s.bigSmall}> {nowParts.half}</Text>
      </Text>
      <Text style={s.sub}>
        A punch now counts as {countsAs(now)}.
        {day.todayHours > 0 ? ` Today so far: ${day.todayHours.toFixed(2)} h.` : ''}
      </Text>
    </View>
  );

  const jobCard = shiftJob ? (
    <View style={s.jobCard}>
      <Text style={s.jobCode}>{jobParts(shiftJob).code}</Text>
      <View style={s.jobNames}>
        <Text style={s.jobTitle}>{jobParts(shiftJob).title}</Text>
        {shiftJob.customer_name ? <Text style={s.jobCustomer}>{shiftJob.customer_name}</Text> : null}
      </View>
    </View>
  ) : null;

  const todayStrip = (
    <View>
      <Label>Today</Label>
      <DayBar entries={day.todayEntries} now={now} c={c} />
    </View>
  );

  const extras = <DayExtras workDate={shiftDate} jobcodeId={shiftJob?.qb_time_jobcode_id ?? job?.qb_time_jobcode_id ?? null} />;

  return (
    <ScreenIn from="left">
    <View style={s.screen}>
      {status}
      {message ? <Text style={s.message}>{message}</Text> : null}

      {open && switching ? (
        <>
          <View style={s.fill}>
            {/* A job switch stays on the day the shift started */}
            <JobPicker
              recent={day.recentJobs}
              selected={shiftJob}
              onPick={(picked) => act(() => switchJob(picked.qb_time_jobcode_id, open.work_date))}
            />
          </View>
          <OutlineButton label="Cancel" onPress={() => {
              smooth();
              setSwitching(false);
            }} disabled={busy} />
        </>
      ) : open ? (
        <>
          {jobCard}
          {todayStrip}
          {extras}
          <View style={s.fill} />
          <View style={s.bottom}>
            <PrimaryButton label="Clock out" busy={busy} onPress={() => act(() => clockOut('day'))} />
            <View style={s.pair}>
              <OutlineButton flex label="Switch job" disabled={busy} onPress={() => {
                  smooth();
                  setSwitching(true);
                }} />
              <OutlineButton flex label="Lunch" disabled={busy} onPress={() => act(() => clockOut('lunch'))} />
            </View>
          </View>
        </>
      ) : day.atLunch && day.last ? (
        <>
          {jobCard}
          {todayStrip}
          {extras}
          <View style={s.fill} />
          <PrimaryButton
            label="Back from lunch"
            busy={busy}
            onPress={() => act(() => clockIn(day.last!.qb_time_jobcode_id, 'lunch', day.last!.work_date))}
          />
        </>
      ) : (
        <>
          <View style={s.fill}>
            <JobPicker recent={day.recentJobs} selected={job} onPick={setJob} />
          </View>
          <View style={s.bottom}>
            {day.todayEntries.length > 0 ? extras : null}
            {Platform.OS !== 'web' && day.todayEntries.length === 0 ? (
              // Silences today's "you aren't clocked in" alarm
              <Pressable style={s.offRow} onPress={toggleOff}>
                <CheckBox on={off} size={20} />
                <Text style={s.sub}>Off today. No alarm.</Text>
              </Pressable>
            ) : null}
            <PrimaryButton
              label={job ? `Clock in to ${jobParts(job).code || 'job'}` : 'Pick a job'}
              disabled={!job}
              busy={busy}
              onPress={() => job && act(() => clockIn(job.qb_time_jobcode_id, 'day', today()))}
            />
          </View>
        </>
      )}
    </View>
    </ScreenIn>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, padding: 14, gap: 12 },
    loading: { marginTop: 48 },
    fill: { flex: 1 },
    status: { paddingVertical: 16, paddingHorizontal: 14, backgroundColor: c.sunk, borderWidth: 1, borderColor: c.line },
    statusIn: { backgroundColor: c.brandWash, borderColor: c.brandWash },
    statusLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    dot: { width: 9, height: 9 },
    statusText: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', color: c.ink },
    big: { fontSize: 60, fontWeight: '700', letterSpacing: -2.5, lineHeight: 64, marginTop: 6, color: c.ink, fontVariant: ['tabular-nums'] },
    bigSmall: { fontSize: 20, fontWeight: '600', letterSpacing: 0 },
    sub: { fontSize: 13, color: c.ink2, marginTop: 4 },
    message: { color: c.no, fontSize: 15 },
    jobCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 12 },
    jobCode: { fontSize: 18, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
    jobNames: { flex: 1 },
    jobTitle: { fontSize: 15, color: c.ink2 },
    jobCustomer: { fontSize: 12, color: c.muted, marginTop: 1 },
    bottom: { gap: 10 },
    pair: { flexDirection: 'row', gap: 10 },
    offRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  });
