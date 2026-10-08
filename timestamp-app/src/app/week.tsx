import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import JobPicker from '../components/JobPicker';
import { ScreenIn, smooth } from '../components/Motion';
import { Label, OutlineButton, PrimaryButton } from '../components/ui';
import { entryJob, Job, jobParts, today } from '../lib/clock';
import {
  addDays,
  addPunch,
  atTime,
  fixPunch,
  getMyWeek,
  MyWeek,
  parseYmd,
  removePunch,
  submitWeek,
  WeekEntry,
  weekStartOf,
} from '../lib/week';
import { Colors, useColors } from '../theme';

type Form = {
  mode: 'add' | 'fix';
  entry: WeekEntry | null;
  day: string;
  job: Job | null;
  inText: string;
  inPm: boolean;
  outText: string;
  outPm: boolean;
  reason: string;
  pickingJob: boolean;
};

const STATUS_TEXT: Record<string, string> = {
  open: 'Not sent yet',
  submitted: 'Sent to your approver',
  approved: 'Approved. Locked.',
  denied: 'Sent back to you',
};
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%` as `${number}%`;
const clockTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now';
const dayName = (day: string) =>
  parseYmd(day).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
const shortDay = (day: string) => parseYmd(day).toLocaleDateString([], { month: 'short', day: 'numeric' });

// "7", "7:05", "705" plus AM/PM -> hours and minutes on a 24 hour clock
function readTime(text: string, pm: boolean): { h: number; m: number } | null {
  const match = text.trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (h < 1 || h > 12 || m > 59) return null;
  if (h === 12) h = 0;
  if (pm) h += 12;
  return { h, m };
}

function showTime(iso: string | null): { text: string; pm: boolean } {
  if (!iso) return { text: '', pm: true };
  const d = new Date(iso);
  return { text: `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`, pm: d.getHours() >= 12 };
}

const sameMinute = (iso: string | null, time: { h: number; m: number }) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() === time.h && d.getMinutes() === time.m;
};

// My week: every punch, fix or add one, send the week to my approver
export default function Week() {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today()));
  const [week, setWeek] = useState<MyWeek | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await getMyWeek(weekStart);
      smooth();
      setWeek(next);
    } catch (e: any) {
      console.error('[Week] Load failed:', e);
      setMessage(e?.message ?? 'Could not load your week');
    }
  }, [weekStart]);

  useEffect(() => {
    setWeek(null);
    setForm(null);
    refresh();
  }, [refresh]);

  // The database owns the rules (locked weeks, overlaps). Its message says what went wrong.
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setForm(null);
      await refresh();
    } catch (e: any) {
      console.error('[Week] Change failed:', e);
      setMessage(e?.message ?? 'That did not go through');
    } finally {
      setBusy(false);
    }
  };

  const startAdd = () => {
    const lastJob = week?.entries.length ? entryJob(week.entries[week.entries.length - 1]) : null;
    const day = today() <= addDays(weekStart, 6) ? today() : addDays(weekStart, 6);
    setMessage('');
    smooth();
    setForm({ mode: 'add', entry: null, day, job: lastJob, inText: '', inPm: false, outText: '', outPm: true, reason: '', pickingJob: false });
  };

  const startFix = (entry: WeekEntry) => {
    const start = showTime(entry.clock_in_at);
    const end = showTime(entry.clock_out_at);
    setMessage('');
    smooth();
    setForm({
      mode: 'fix',
      entry,
      day: entry.work_date,
      job: entryJob(entry),
      inText: start.text,
      inPm: start.pm,
      outText: end.text,
      outPm: end.pm,
      reason: '',
      pickingJob: false,
    });
  };

  const save = () => {
    if (!form) return;
    const start = readTime(form.inText, form.inPm);
    const end = form.outText.trim() ? readTime(form.outText, form.outPm) : null;
    if (!start || (form.outText.trim() && !end)) {
      setMessage('Type times like 7:05');
      return;
    }
    if (!form.reason.trim()) {
      setMessage('Say why');
      return;
    }
    if (end && end.h * 60 + end.m <= start.h * 60 + start.m) {
      setMessage('Out must be after in');
      return;
    }

    if (form.mode === 'add') {
      if (!form.job || !end) {
        setMessage('Pick a job and give both times');
        return;
      }
      const job = form.job;
      act(() => addPunch(form.day, job.qb_time_jobcode_id, atTime(form.day, start.h, start.m), atTime(form.day, end.h, end.m), form.reason.trim()));
      return;
    }

    // Only send the times that changed, so an untouched time keeps its seconds
    const entry = form.entry!;
    const newIn = sameMinute(entry.clock_in_at, start) ? null : atTime(form.day, start.h, start.m);
    const newOut = !end || sameMinute(entry.clock_out_at, end) ? null : atTime(form.day, end.h, end.m);
    if (!newIn && !newOut) {
      setMessage('Nothing changed');
      return;
    }
    act(() => fixPunch(entry.id, newIn, newOut, form.reason.trim()));
  };

  const remove = () => {
    if (!form?.entry) return;
    if (!form.reason.trim()) {
      setMessage('Say why');
      return;
    }
    const entry = form.entry;
    act(() => removePunch(entry.id, form.reason.trim()));
  };

  // The job list needs the whole screen
  if (form?.pickingJob) {
    const recent = week
      ? week.entries
          .map(entryJob)
          .filter((j): j is Job => !!j)
          .filter((j, i, all) => all.findIndex((x) => x.qb_time_jobcode_id === j.qb_time_jobcode_id) === i)
      : [];
    return (
      <ScreenIn from="right">
      <View style={s.screen}>
        <View style={s.fill}>
          <JobPicker recent={recent} selected={form.job} onPick={(job) => setForm({ ...form, job, pickingJob: false })} />
        </View>
        <OutlineButton label="Cancel" onPress={() => setForm({ ...form, pickingJob: false })} />
      </View>
      </ScreenIn>
    );
  }

  const locked = week?.status === 'approved';
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayHours = days.map((day) =>
    week ? week.entries.filter((e) => e.work_date === day).reduce((sum, e) => sum + Number(e.hours ?? 0), 0) : 0
  );
  const total = dayHours.reduce((sum, h) => sum + h, 0);
  const tallest = Math.max(10, ...dayHours);
  const perDiemDays = week ? week.extras.filter((x) => x.per_diem).length : 0;
  const miles = week ? week.extras.reduce((sum, x) => sum + x.miles, 0) : 0;
  const thisWeek = weekStart >= weekStartOf(today());

  return (
    <ScreenIn from="right">
    <View style={s.screen}>
      <View style={s.weekRow}>
        <Pressable style={s.arrow} onPress={() => setWeekStart(addDays(weekStart, -7))}>
          <Text style={s.arrowText}>‹</Text>
        </Pressable>
        <Text style={s.weekLabel}>
          {shortDay(weekStart)} to {shortDay(addDays(weekStart, 6))}
        </Text>
        <Pressable style={s.arrow} disabled={thisWeek} onPress={() => setWeekStart(addDays(weekStart, 7))}>
          <Text style={[s.arrowText, thisWeek && s.faded]}>›</Text>
        </Pressable>
      </View>

      {!week ? (
        message ? <Text style={s.message}>{message}</Text> : <ActivityIndicator color={c.brand} style={s.loading} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
          <View style={s.totalRow}>
            <Text style={s.total}>{total.toFixed(2)}</Text>
            <Text style={s.totalNote}>{thisWeek ? 'hours so far' : 'hours'}</Text>
          </View>
          {/* How far along toward 40 */}
          <View style={s.progress}>
            <View style={[s.progressFill, { width: pct((total / 40) * 100) }]} />
          </View>
          <Text style={s.mini}>
            {[
              STATUS_TEXT[week.status],
              perDiemDays > 0 && `Per diem ${perDiemDays} day${perDiemDays === 1 ? '' : 's'}`,
              miles > 0 && `${miles} mi`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {week.status === 'denied' && week.deniedNote ? <Text style={s.denied}>"{week.deniedNote}"</Text> : null}

          <View>
            <View style={s.chart}>
              {dayHours.map((hours, i) => {
                const running = week.entries.some((e) => e.work_date === days[i] && !e.clock_out_at);
                return (
                  <View key={days[i]} style={s.barSlot}>
                    {hours > 0 || running ? <Text style={s.barLabel}>{running ? 'now' : hours.toFixed(2)}</Text> : null}
                    <View style={[s.bar, { height: pct(running && hours === 0 ? 8 : (hours / tallest) * 100) }, running && s.barRunning]} />
                  </View>
                );
              })}
            </View>
            <View style={s.axis}>
              {DAY_LETTERS.map((letter, i) => (
                <Text key={i} style={s.axisText}>
                  {letter}
                </Text>
              ))}
            </View>
          </View>

          {message ? <Text style={s.message}>{message}</Text> : null}

          {form ? (
            <View style={s.card}>
              <Text style={s.formTitle}>{form.mode === 'add' ? 'Add a missed punch' : `Fix punch, ${dayName(form.day)}`}</Text>
              {form.mode === 'add' ? (
                <>
                  <View style={s.chips}>
                    {days
                      .filter((d) => d <= today())
                      .map((d) => (
                        <Pressable key={d} style={[s.chip, form.day === d && s.chipOn]} onPress={() => setForm({ ...form, day: d })}>
                          <Text style={[s.chipText, form.day === d && s.chipTextOn]}>{dayName(d)}</Text>
                        </Pressable>
                      ))}
                  </View>
                  <Pressable onPress={() => setForm({ ...form, pickingJob: true })}>
                    <Text style={s.jobPick}>
                      {form.job ? `${jobParts(form.job).code} ${jobParts(form.job).title}` : 'Pick a job'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Text style={s.mini}>
                  {jobParts(form.job).code} {jobParts(form.job).title}
                </Text>
              )}
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>In</Text>
                <TextInput style={s.time} value={form.inText} onChangeText={(inText) => setForm({ ...form, inText })} placeholder="7:00" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />
                <Pressable style={s.ampm} onPress={() => setForm({ ...form, inPm: !form.inPm })}>
                  <Text style={s.ampmText}>{form.inPm ? 'PM' : 'AM'}</Text>
                </Pressable>
              </View>
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>Out</Text>
                <TextInput style={s.time} value={form.outText} onChangeText={(outText) => setForm({ ...form, outText })} placeholder="3:30" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />
                <Pressable style={s.ampm} onPress={() => setForm({ ...form, outPm: !form.outPm })}>
                  <Text style={s.ampmText}>{form.outPm ? 'PM' : 'AM'}</Text>
                </Pressable>
              </View>
              <TextInput style={s.reason} value={form.reason} onChangeText={(reason) => setForm({ ...form, reason })} placeholder="Why? (your approver sees this)" placeholderTextColor={c.muted} />
              <Text style={s.mini}>Times round to the quarter hour.</Text>
              <PrimaryButton label="Save" busy={busy} onPress={save} />
              {form.mode === 'fix' ? <OutlineButton danger label="Remove this punch" disabled={busy} onPress={remove} /> : null}
              <OutlineButton label="Cancel" disabled={busy} onPress={() => {
                  smooth();
                  setForm(null);
                }} />
            </View>
          ) : null}

          {days.map((day, i) => {
            const punches = week.entries.filter((e) => e.work_date === day);
            const extra = week.extras.find((x) => x.work_date === day);
            if (punches.length === 0 && !extra?.per_diem && !extra?.miles) return null;

            return (
              <View key={day}>
                <View style={s.dayHead}>
                  <Label>{dayName(day)}</Label>
                  <Text style={s.dayHours}>{dayHours[i].toFixed(2)} h</Text>
                </View>
                <View style={s.dayList}>
                  {punches.map((e) => (
                    <Pressable key={e.id} style={s.punch} disabled={locked} onPress={() => startFix(e)}>
                      <Text style={s.punchCode}>{jobParts(e.time_jobs).code}</Text>
                      <View style={s.fill}>
                        <Text style={s.punchTime}>
                          {clockTime(e.counted_in_at)} to {clockTime(e.counted_out_at)}
                          {e.ended_for === 'lunch' ? ' (lunch)' : ''}
                        </Text>
                        <Text style={s.punchJob}>
                          {jobParts(e.time_jobs).title}
                          {e.fixed_at ? ' · fixed' : ''}
                        </Text>
                      </View>
                      <Text style={s.punchHours}>{e.hours != null ? Number(e.hours).toFixed(2) : ''}</Text>
                    </Pressable>
                  ))}
                  {extra?.per_diem || extra?.miles ? (
                    <Text style={s.extra}>
                      {[extra.per_diem && 'Per diem', extra.miles > 0 && `${extra.miles} miles`].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}

          {week.entries.length === 0 ? <Text style={s.mini}>No time this week.</Text> : null}

          {!locked && !form ? (
            <View style={s.actions}>
              {week.entries.length > 0 ? <Text style={s.mini}>Tap a punch to fix it.</Text> : null}
              <OutlineButton label="Add a missed punch" onPress={startAdd} />
              {week.status !== 'submitted' && week.entries.length > 0 ? (
                <PrimaryButton label="Send week to approver" busy={busy} onPress={() => act(() => submitWeek(weekStart))} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
    </ScreenIn>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, padding: 14, gap: 12 },
    fill: { flex: 1 },
    loading: { marginTop: 48 },
    weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    arrow: { paddingHorizontal: 14 },
    arrowText: { fontSize: 30, lineHeight: 32, color: c.ink },
    faded: { opacity: 0.2 },
    weekLabel: { fontSize: 15, color: c.ink, fontWeight: '700' },
    scroll: { gap: 12, paddingBottom: 24 },
    totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    total: { fontSize: 48, fontWeight: '700', letterSpacing: -2, lineHeight: 52, color: c.ink, fontVariant: ['tabular-nums'] },
    totalNote: { fontSize: 13, color: c.muted },
    progress: { height: 6, backgroundColor: c.sunk, borderWidth: 1, borderColor: c.line },
    progressFill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: c.brand },
    mini: { fontSize: 13, color: c.muted },
    denied: { fontSize: 15, color: c.no },
    message: { color: c.no, fontSize: 15 },
    chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96, paddingTop: 16, borderBottomWidth: 1.5, borderBottomColor: c.ink },
    barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch' },
    bar: { backgroundColor: c.ink2 },
    barRunning: { backgroundColor: c.brand },
    barLabel: { fontSize: 10, fontWeight: '600', color: c.ink, textAlign: 'center', marginBottom: 2, fontVariant: ['tabular-nums'] },
    axis: { flexDirection: 'row', gap: 6, marginTop: 4 },
    axisText: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', color: c.muted },
    card: { backgroundColor: c.sunk, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10 },
    formTitle: { fontSize: 17, fontWeight: '700', color: c.ink },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderWidth: 1, borderColor: c.line2, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.surface },
    chipOn: { backgroundColor: c.ink, borderColor: c.ink },
    chipText: { color: c.ink, fontSize: 13 },
    chipTextOn: { color: c.bg },
    jobPick: { color: c.brandText, fontSize: 16, fontWeight: '700' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    timeLabel: { width: 36, color: c.ink, fontSize: 16 },
    time: { width: 90, borderWidth: 1, borderColor: c.line2, backgroundColor: c.surface, color: c.ink, fontSize: 16, paddingHorizontal: 10, paddingVertical: 8 },
    ampm: { borderWidth: 1.5, borderColor: c.ink, paddingHorizontal: 12, paddingVertical: 8 },
    ampmText: { color: c.ink, fontWeight: '700' },
    reason: { borderWidth: 1, borderColor: c.line2, backgroundColor: c.surface, color: c.ink, fontSize: 16, paddingHorizontal: 10, paddingVertical: 10 },
    dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    dayHours: { fontSize: 13, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
    dayList: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    punch: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.surface },
    punchCode: { width: 60, fontSize: 15, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
    punchTime: { fontSize: 15, color: c.ink },
    punchJob: { fontSize: 12, color: c.muted, marginTop: 1 },
    punchHours: { fontSize: 15, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
    extra: { fontSize: 13, color: c.ink2, paddingVertical: 8, paddingHorizontal: 12 },
    actions: { gap: 10, marginTop: 4 },
  });
