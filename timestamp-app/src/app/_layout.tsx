import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import type { Session } from '@supabase/supabase-js';
import AlarmTap from '../components/AlarmTap';
import DotGrid from '../components/DotGrid';
import { Logo } from '../components/Logo';
import { smooth } from '../components/Motion';
import { supabase } from '../lib/supabase';
import SignIn from '../screens/SignIn';
import { Colors, useColors } from '../theme';

// "Jack Lyons" -> "JL". Falls back to the email's first letters.
function initialsOf(session: Session): string {
  const name: string = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || '';
  const words = name.split(/[\s@._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Every screen sits behind the sign-in. No session, no screens.
export default function RootLayout() {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const path = usePathname();
  const onWeek = path.startsWith('/week');
  // 0 = Clock, 1 = My week. Drives the sliding tab line and the backdrop cross-fade.
  const slide = useRef(new Animated.Value(onWeek ? 1 : 0)).current;
  const [tabsWidth, setTabsWidth] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e) => console.error('[Layout] Session check failed:', e))
      .finally(() => setReady(true));

    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: onWeek ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [onWeek, slide]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={s.screen}>
        {!ready ? (
          <View style={s.center}>
            <ActivityIndicator color={c.brand} />
          </View>
        ) : !session ? (
          <SignIn />
        ) : (
          <>
            {Platform.OS !== 'web' ? <AlarmTap /> : null}

            <View style={s.top}>
              <Logo height={20} />
              <Pressable
                style={s.avatar}
                onPress={() => {
                  smooth();
                  setMenu(!menu);
                }}
              >
                <Text style={s.avatarText}>{initialsOf(session)}</Text>
              </Pressable>
            </View>
            {menu ? (
              <View style={s.menu}>
                <Text style={s.menuText} numberOfLines={1}>
                  {session.user.email}
                </Text>
                <Pressable
                  onPress={() => {
                    setMenu(false);
                    supabase.auth.signOut();
                  }}
                >
                  <Text style={s.signOut}>Sign out</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={s.body}>
              {/* Dots behind the clock, graph lines behind My week, fading from one to the other */}
              <Animated.View
                style={[StyleSheet.absoluteFill, { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
                pointerEvents="none"
              >
                <DotGrid kind="dots" />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: slide }]} pointerEvents="none">
                <DotGrid kind="grid" />
              </Animated.View>
              <Slot />
            </View>

            <View style={s.tabs} onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}>
              {/* One orange line that slides to the tab you're on */}
              <Animated.View
                style={[
                  s.tabLine,
                  {
                    width: tabsWidth / 2,
                    transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, tabsWidth / 2] }) }],
                  },
                ]}
              />
              <Pressable style={s.tab} onPress={() => router.replace('/')}>
                <Svg width={22} height={22} viewBox="0 0 20 20" fill="none" stroke={onWeek ? c.muted : c.brandText} strokeWidth={1.8}>
                  <Rect x={2.5} y={2.5} width={15} height={15} />
                  <Path d="M10 6v4.5h3.5" />
                </Svg>
                <Text style={[s.tabText, !onWeek && s.tabTextOn]}>Clock</Text>
              </Pressable>
              <Pressable style={s.tab} onPress={() => router.replace('/week')}>
                <Svg width={22} height={22} viewBox="0 0 20 20" fill="none" stroke={onWeek ? c.brandText : c.muted} strokeWidth={1.8}>
                  <Path d="M4 17V9M10 17V4M16 17v-6" />
                </Svg>
                <Text style={[s.tabText, onWeek && s.tabTextOn]}>My week</Text>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    top: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    avatar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink },
    avatarText: { color: c.bg, fontSize: 12, fontWeight: '700' },
    menu: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: c.sunk,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    menuText: { flex: 1, color: c.muted, fontSize: 13 },
    signOut: { color: c.brandText, fontSize: 15, fontWeight: '700' },
    body: { flex: 1, backgroundColor: c.surface },
    tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line },
    tab: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 8, paddingBottom: 6 },
    tabLine: { position: 'absolute', top: -1, left: 0, height: 2, backgroundColor: c.brand },
    tabText: { fontSize: 11, fontWeight: '600', color: c.muted },
    tabTextOn: { color: c.brandText },
  });
