import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme';

// Small shared pieces, so every screen has the same buttons and labels. Square corners.

export function Label({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[styles.label, { color: c.muted }]}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: c.brand, borderColor: c.brand },
        (disabled || busy) && styles.dim,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {busy ? <ActivityIndicator color={c.onBrand} /> : <Text style={[styles.primaryText, { color: c.onBrand }]}>{label}</Text>}
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  disabled,
  danger,
  flex,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  flex?: boolean;
}) {
  const c = useColors();
  const color = danger ? c.no : c.ink;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.outline,
        { borderColor: color, backgroundColor: c.surface },
        flex && styles.flex,
        disabled && styles.dim,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.outlineText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function CheckBox({ on, size = 22 }: { on: boolean; size?: number }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderColor: on ? c.brand : c.line2, backgroundColor: on ? c.brand : 'transparent' },
      ]}
    >
      {on ? <Text style={{ color: c.onBrand, fontSize: size * 0.7, fontWeight: '800', lineHeight: size * 0.9 }}>✓</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' },
  primary: { borderWidth: 1.5, paddingVertical: 18, alignItems: 'center' },
  primaryText: { fontSize: 19, fontWeight: '700' },
  outline: { borderWidth: 1.5, paddingVertical: 14, alignItems: 'center' },
  outlineText: { fontSize: 15, fontWeight: '700' },
  box: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
});
