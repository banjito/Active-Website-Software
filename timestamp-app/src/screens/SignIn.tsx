import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import DotGrid from '../components/DotGrid';
import { StackedLogo } from '../components/Logo';
import { PrimaryButton } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, useColors } from '../theme';

// Same email and password as ampOS
export default function SignIn() {
  const c = useColors();
  const s = useMemo(() => make(c), [c]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch (e: any) {
      console.error('[SignIn] Failed:', e);
      setError(e?.message ?? 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <DotGrid />
      <View style={s.logo}>
        <StackedLogo width={230} />
      </View>
      <Text style={s.hint}>Sign in with your ampOS email and password.</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={c.muted}
        secureTextEntry
        onSubmitEditing={signIn}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <PrimaryButton label="Sign in" onPress={signIn} busy={busy} />
    </View>
  );
}

const make = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.bg },
    logo: { alignItems: 'center' },
    hint: { color: c.muted, textAlign: 'center', marginTop: 20, marginBottom: 24, fontSize: 14 },
    input: {
      borderWidth: 1,
      borderColor: c.line2,
      backgroundColor: c.surface,
      color: c.ink,
      fontSize: 16,
      paddingHorizontal: 12,
      paddingVertical: 14,
      marginBottom: 12,
    },
    error: { color: c.no, marginBottom: 12 },
  });
