import React, { useEffect, useRef } from 'react';
import { Animated, Easing, LayoutAnimation, Platform } from 'react-native';

// Call right before a change that adds, removes, or resizes things on screen.
// The next layout eases into place instead of snapping.
export function smooth() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
  );
}

// A screen fades in and slides a little from the side its tab is on
export function ScreenIn({ from, children }: { from: 'left' | 'right'; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'right' ? 28 : -28, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
