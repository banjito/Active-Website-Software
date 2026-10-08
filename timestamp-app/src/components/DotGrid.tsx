import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';

// Faint backdrop behind a screen, in the logo's orange-to-amber fade (the "AMP" letters).
// 'dots' is a dot grid. 'grid' is graph-paper lines. Sits under everything and ignores touches.

// Size of one graph-paper square
const GRID_CELL = 16;

// Same two colors as the gradient in the logo file
const FADE_FROM = 'rgb(213,114,33)';
const FADE_TO = 'rgb(225,172,98)';

// The lines are drawn one by one at exact sizes, so a square is the same size on every phone
function GridLines() {
  const { width, height } = useWindowDimensions();

  const lines = useMemo(() => {
    let d = '';
    for (let x = GRID_CELL; x < width; x += GRID_CELL) d += `M${x + 0.5} 0V${height}`;
    for (let y = GRID_CELL; y < height; y += GRID_CELL) d += `M0 ${y + 0.5}H${width}`;
    return d;
  }, [width, height]);

  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id="amp-grid" x1={0} y1={0} x2={width} y2={height * 0.725} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={FADE_FROM} />
          <Stop offset="1" stopColor={FADE_TO} />
        </LinearGradient>
      </Defs>
      <Path d={lines} stroke="url(#amp-grid)" strokeWidth={0.75} fill="none" opacity={0.18} />
    </Svg>
  );
}

// The fade is painted across the whole screen, then shown only through the dots
function Dots() {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id="amp-dots" x1="0" y1="0" x2="1" y2="0.725">
          <Stop offset="0" stopColor={FADE_FROM} />
          <Stop offset="1" stopColor={FADE_TO} />
        </LinearGradient>
        <Pattern id="pattern-dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
          <Circle cx="2" cy="2" r="1" fill="#ffffff" />
        </Pattern>
        <Mask id="mask-dots">
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#pattern-dots)" />
        </Mask>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#amp-dots)" mask="url(#mask-dots)" opacity={0.55} />
    </Svg>
  );
}

function DotGrid({ kind = 'dots' }: { kind?: 'dots' | 'grid' }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {kind === 'grid' ? <GridLines /> : <Dots />}
    </View>
  );
}

// Never changes, so it is drawn once and not again each time the clock ticks
export default React.memo(DotGrid);
