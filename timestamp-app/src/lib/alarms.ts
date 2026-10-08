import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { MyDay, today } from './clock';
import { db, supabase } from './supabase';
import { addDays, parseYmd } from './week';

// The phone sets its own alarms, so they ring with no signal. Phones only: the web
// version is for clocking in at a desk and does not ring.

const CHANNEL = 'clock';
const DAYS_AHEAD = 14;
const offKey = (day: string) => `timestamp_off_${day}`;

if (Platform.OS !== 'web') {
  // Show the alarm even when the app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function isOffToday(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(offKey(today())));
}

export async function setOffToday(off: boolean): Promise<void> {
  if (off) await AsyncStorage.setItem(offKey(today()), '1');
  else await AsyncStorage.removeItem(offKey(today()));
}

/**
 * Throw out every alarm on the phone and set them again from where things stand now.
 * Called each time the clock screen loads and after every punch, so clocking in
 * clears today's alarm and the next two weeks are always armed.
 *
 *   No punch 5 minutes after start time: "You aren't clocked in!" Once more 15 minutes later.
 *   30 minutes into lunch: "Back from lunch?"
 */
export async function syncAlarms(day: MyDay): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Start time and work days are set by payroll
    const { data: me, error } = await db
      .from('time_people')
      .select('clocks_in, start_time, work_days')
      .eq('profile_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!me?.clocks_in) return;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Clock reminders',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const now = Date.now();
    const ring = async (identifier: string, at: Date, title: string) => {
      if (at.getTime() <= now) return;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title, body: 'Tap here to clock in!', sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
      });
    };

    if (day.atLunch && day.last?.clock_out_at) {
      await ring('lunch', new Date(new Date(day.last.clock_out_at).getTime() + 30 * 60000), 'Back from lunch?');
    }

    if (!me.start_time) return;
    const [hours, minutes] = String(me.start_time).split(':').map(Number);
    const workDays: number[] = me.work_days ?? [];
    const punchedToday = !!day.open || day.last?.work_date === today();

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = addDays(today(), i);
      const at = parseYmd(date);
      if (!workDays.includes(at.getDay())) continue;
      if (i === 0 && punchedToday) continue;
      if (await AsyncStorage.getItem(offKey(date))) continue;

      at.setHours(hours, minutes + 5, 0, 0);
      await ring(`in-${date}-1`, at, "You aren't clocked in!");
      await ring(`in-${date}-2`, new Date(at.getTime() + 15 * 60000), "You aren't clocked in!");
    }
  } catch (e) {
    console.error('[Alarms] Could not set alarms:', e);
  }
}
