import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bus, fetchBuses } from './src/api';
import { ApiStatusBanner } from './src/components/ApiStatusBanner';
import { BusList } from './src/components/BusList';
import { getApiBaseUrl } from './src/config';
import { ApiError, toApiError } from './src/errors';
import { getDeviceId, getPhoneSurrogate } from './src/identity';

export default function App() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const sortedBuses = useMemo(
    () => [...buses].sort((a, b) => a.minutes_depuis_signalement - b.minutes_depuis_signalement),
    [buses],
  );

  const loadBuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchBuses();
      setBuses(payload.buses);
    } catch (err) {
      setError(toApiError(err));
      setBuses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const deviceId = getDeviceId();
    setDeviceLabel(getPhoneSurrogate(deviceId));
  }, []);

  useEffect(() => {
    if (apiBaseUrl) {
      void loadBuses();
    }
  }, [apiBaseUrl, loadBuses]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadBuses} enabled={apiBaseUrl.length > 0} />}
    >
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <Text selectable style={styles.kicker}>Xetu Mobile</Text>
        <Text selectable style={styles.title}>Bus live pour Dakar</Text>
        <Text selectable style={styles.subtitle}>Positions estimees, fraicheur du signal et confiance communautaire.</Text>
      </View>

      <ApiStatusBanner apiBaseUrl={apiBaseUrl} deviceLabel={deviceLabel} error={error} loading={loading} onRetry={loadBuses} />

      <View style={styles.sectionHeader}>
        <View>
          <Text selectable style={styles.sectionTitle}>Bus detectes</Text>
          <Text selectable style={styles.sectionSubtitle}>Tries du signal le plus recent au plus ancien</Text>
        </View>
        <Text selectable style={styles.count}>{sortedBuses.length}</Text>
      </View>

      <BusList buses={sortedBuses} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f4f7f1', gap: 18, minHeight: '100%', paddingBottom: 36, paddingHorizontal: 18, paddingTop: 54 },
  hero: { gap: 8 },
  kicker: { color: '#116a5c', fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: '#101915', fontSize: 30, fontWeight: '900', lineHeight: 36 },
  subtitle: { color: '#5c6a63', fontSize: 15, lineHeight: 22, maxWidth: 560 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  sectionTitle: { color: '#101915', fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: '#64726b', fontSize: 13, lineHeight: 18, marginTop: 3 },
  count: { color: '#116a5c', fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '900' },
});
