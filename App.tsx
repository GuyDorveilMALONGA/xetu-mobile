import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { createElement, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { getAllowedWebViewOrigins, getPwaUrl } from './src/config';

type NativeBridgePayload =
  | {
      type: 'nativeCapabilities';
      bridgeVersion: 1;
      geoloc: true;
      push: false;
      platform: typeof Platform.OS;
      shell: 'expo-webview';
    }
  | {
      type: 'locationResult';
      requestId?: string | null;
      lat?: number;
      lon?: number;
      accuracy?: number | null;
      error?: 'permission_denied' | 'location_unavailable' | 'invalid_request';
    };

type WebBridgeRequest = {
  type?: string;
  action?: string;
  requestId?: string | null;
};

function createBridgeInjection(payload: NativeBridgePayload) {
  const serializedPayload = JSON.stringify(payload).replace(/</g, '\\u003c');

  return `
    (function () {
      var payload = ${serializedPayload};
      var payloadText = JSON.stringify(payload);

      try {
        window.dispatchEvent(new CustomEvent('xetu:nativeMessage', { detail: payload }));
      } catch (error) {}

      try {
        window.dispatchEvent(new MessageEvent('message', { data: payloadText }));
      } catch (error) {}

      try {
        if (window.XetuNativeBridge && typeof window.XetuNativeBridge.receive === 'function') {
          window.XetuNativeBridge.receive(payload);
        }
      } catch (error) {}
    })();
    true;
  `;
}

const injectedBridgeBootstrap = `
  (function () {
    window.XETU_NATIVE_SHELL = true;
    window.XetuNative = window.XetuNative || {};
    window.XetuNative.requestLocation = function (requestId) {
      if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') {
        return false;
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'requestLocation',
        requestId: requestId || null
      }));
      return true;
    };
  })();
  true;
`;

function getOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isAllowedNavigation(url: string, allowedOrigins: string[]) {
  if (url === 'about:blank' || url.startsWith('about:blank#')) {
    return true;
  }

  const origin = getOrigin(url);
  return origin !== null && allowedOrigins.includes(origin);
}

function WebPreviewFrame({ pwaUrl }: { pwaUrl: string }) {
  return (
    <View style={styles.webPreviewContainer}>
      {createElement('iframe', {
        allow: 'geolocation',
        src: pwaUrl,
        style: styles.webPreviewFrame,
        title: 'Xetu PWA',
      })}
    </View>
  );
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const pwaUrl = useMemo(() => getPwaUrl(Platform.OS), []);
  const allowedOrigins = useMemo(() => getAllowedWebViewOrigins(Platform.OS), []);

  const sendToPwa = useCallback((payload: NativeBridgePayload) => {
    webViewRef.current?.injectJavaScript(createBridgeInjection(payload));
  }, []);

  const sendCapabilities = useCallback(() => {
    sendToPwa({
      type: 'nativeCapabilities',
      bridgeVersion: 1,
      geoloc: true,
      push: false,
      platform: Platform.OS,
      shell: 'expo-webview',
    });
  }, [sendToPwa]);

  const sendLocationResult = useCallback(
    (payload: Omit<Extract<NativeBridgePayload, { type: 'locationResult' }>, 'type'>) => {
      sendToPwa({
        type: 'locationResult',
        ...payload,
      });
    },
    [sendToPwa],
  );

  const handleLocationRequest = useCallback(
    async (requestId?: string | null) => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        sendLocationResult({ requestId, error: 'permission_denied' });
        return;
      }

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        sendLocationResult({
          requestId,
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          accuracy: location.coords.accuracy,
        });
      } catch {
        sendLocationResult({ requestId, error: 'location_unavailable' });
      }
    },
    [sendLocationResult],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: WebBridgeRequest;

      try {
        message = JSON.parse(event.nativeEvent.data) as WebBridgeRequest;
      } catch {
        sendLocationResult({ error: 'invalid_request' });
        return;
      }

      const messageType = message.type ?? message.action;
      if (messageType === 'requestLocation') {
        void handleLocationRequest(message.requestId);
      }
    },
    [handleLocationRequest, sendLocationResult],
  );

  const handleShouldStartLoad = useCallback(
    (request: WebViewNavigation) => {
      const allowed = isAllowedNavigation(request.url, allowedOrigins);
      if (!allowed) {
        setBlockedUrl(request.url);
      }
      return allowed;
    },
    [allowedOrigins],
  );

  const retry = useCallback(() => {
    setBlockedUrl(null);
    setLoadFailed(false);
    setWebViewKey((key) => key + 1);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.appContainer}>
        <StatusBar style="dark" />
        <WebPreviewFrame pwaUrl={pwaUrl} />
      </View>
    );
  }

  return (
    <View style={styles.appContainer}>
      <StatusBar style="dark" />
      {loadFailed ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>PWA injoignable</Text>
          <Text style={styles.errorText}>
            Impossible de charger Xetu depuis {pwaUrl}. Verifie que la PWA est lancee et accessible depuis cet appareil.
          </Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Reessayer</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <WebView
            key={webViewKey}
            ref={webViewRef}
            source={{ uri: pwaUrl }}
            style={styles.webView}
            originWhitelist={['http://*', 'https://*']}
            injectedJavaScriptBeforeContentLoaded={injectedBridgeBootstrap}
            javaScriptEnabled
            domStorageEnabled
            geolocationEnabled={false}
            setSupportMultipleWindows={false}
            onLoadStart={() => {
              setLoadFailed(false);
              setBlockedUrl(null);
            }}
            onLoadEnd={sendCapabilities}
            onError={() => setLoadFailed(true)}
            onHttpError={() => setLoadFailed(true)}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#116a5c" />
                <Text style={styles.loadingText}>Chargement de Xetu...</Text>
              </View>
            )}
          />

          {blockedUrl ? (
            <View style={styles.blockedBanner}>
              <Text style={styles.blockedText}>Navigation bloquee hors PWA: {getOrigin(blockedUrl) ?? blockedUrl}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  blockedBanner: {
    backgroundColor: '#fff4df',
    borderTopColor: '#f0c36a',
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: 0,
  },
  blockedText: {
    color: '#5f4300',
    fontSize: 12,
    fontWeight: '700',
  },
  errorContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#42514a',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#11251d',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingText: {
    color: '#42514a',
    fontSize: 14,
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: '#116a5c',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  webPreviewContainer: {
    flex: 1,
  },
  webPreviewFrame: {
    borderWidth: 0,
    height: '100%',
    width: '100%',
  },
  webView: {
    flex: 1,
  },
});
