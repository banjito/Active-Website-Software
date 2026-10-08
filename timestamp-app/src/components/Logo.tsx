import React from 'react';
import { SvgXml } from 'react-native-svg';
import { LOGO, STACKED } from '../brand/logos';
import { useColors } from '../theme';

// One-line logo for the app header
export function Logo({ height = 20 }: { height?: number }) {
  const c = useColors();
  return <SvgXml xml={LOGO.replace(/__INK__/g, c.logoInk)} height={height} width={(height * 2632) / 390} />;
}

// Two-line logo for the sign-in screen
export function StackedLogo({ width = 220 }: { width?: number }) {
  const c = useColors();
  return <SvgXml xml={STACKED.replace(/__INK__/g, c.logoInk)} width={width} height={(width * 795) / 1402} />;
}
