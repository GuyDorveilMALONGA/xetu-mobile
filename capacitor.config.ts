import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xetu.mobile',
  appName: 'Xëtu',
  webDir: 'www',
  plugins: {
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0A0F1E',
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0A0F1E',
    },
  },
};

export default config;
