import { useColorScheme } from 'react-native';

// Same colors as the mockups in the scope. Orange and brown come from the logo.
const light = {
  bg: '#fafafa',
  surface: '#ffffff',
  sunk: '#f5f5f5',
  ink: '#171717',
  ink2: '#404040',
  muted: '#6b6b6b',
  line: '#e5e5e5',
  line2: '#d4d4d4',
  brand: '#d57221',
  brandText: '#a14f0d',
  brandWash: '#fbf0e4',
  onBrand: '#ffffff',
  logoInk: '#351d13',
  ok: '#15803d',
  no: '#b91c1c',
};

const dark: Colors = {
  bg: '#0a0a0a',
  surface: '#171717',
  sunk: '#1f1f1f',
  ink: '#fafafa',
  ink2: '#d4d4d4',
  muted: '#a3a3a3',
  line: '#262626',
  line2: '#404040',
  brand: '#d57221',
  brandText: '#e8b06c',
  brandWash: '#2c1a0b',
  onBrand: '#ffffff',
  // The logo's brown letters turn off-white so they stay readable
  logoInk: '#f5ece6',
  ok: '#22c55e',
  no: '#f87171',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
