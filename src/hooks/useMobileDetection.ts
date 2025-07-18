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
      const userAgent = navigator.userAgent;
      
      // Mobile device detection
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
                            ('ontouchstart' in window) ||
                            (navigator.maxTouchPoints > 0);
      
      // Screen size detection
      const isSmallScreen = width <= 640;
      const isTabletScreen = width > 640 && width <= 1024;
      const isMobile = isMobileDevice || isSmallScreen;
      
      let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
      if (isSmallScreen || (isMobileDevice && width <= 768)) {
        deviceType = 'mobile';
      } else if (isTabletScreen || (isMobileDevice && width <= 1024)) {
        deviceType = 'tablet';
      }

      setDetection({
        isMobile,
        isSmallScreen,
        screenWidth: width,
        deviceType
      });

      // Add/remove mobile class to document
      if (isMobile) {
        document.documentElement.classList.add('mobile-device');
        document.documentElement.classList.add('mobile-detected');
      } else {
        document.documentElement.classList.remove('mobile-device');
        document.documentElement.classList.remove('mobile-detected');
      }
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