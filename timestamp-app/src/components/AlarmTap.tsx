import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

// Tapping an alarm opens straight to the clock, wherever the app was left.
// Phones only. The layout does not render this on the web.
export default function AlarmTap() {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      router.replace('/');
    }
  }, [response]);

  return null;
}
