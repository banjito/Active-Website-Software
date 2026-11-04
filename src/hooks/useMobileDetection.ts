import { useState, useEffect } from 'react';

interface MobileDetection {
  isMobile: boolean;
  isSmallScreen: boolean;
  screenWidth: number;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

export const useMobileDetection = (): MobileDetection => {
  const [detection, setDetection] = useState<MobileDetection>({
    isMobile: false,
    isSmallScreen: false,
    screenWidth: 0,
    deviceType: 'desktop'
  });

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      
      // Touch-first device: finger is the main pointer and there is no
      // hover. Touchscreen laptops with a mouse/trackpad do not match.
      const isTouchDevice =
        window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ??
        false;

      const isSmallScreen = width <= 640;
      const isMobile = isSmallScreen || (isTouchDevice && width <= 1024);

      let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
      if (isSmallScreen || (isTouchDevice && width <= 768)) {
        deviceType = 'mobile';
      } else if (width <= 1024) {
        deviceType = 'tablet';
      }

      setDetection({
        isMobile,
        isSmallScreen,
        screenWidth: width,
        deviceType
      });
    };

    // Initial check
    checkDevice();

    // Listen for resize and orientation changes
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', () => {
      setTimeout(checkDevice, 100);
    });

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  return detection;
};

export default useMobileDetection; 