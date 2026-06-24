import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bus, fetchBuses, getApiBaseUrl } from './src/api';

export default function App() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBaseUrl = getApiBaseUrl();

  const loadBuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchBuses();
      setBuses(payload.buses);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBuses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (apiBaseUrl) {
      void loadBuses();
    }
  }, [apiBaseUrl, loadBuses]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Image source={require('./assets/icon.png')} style={styles.logo} />
          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>Xetu Mobile</Text>
            <Text style={styles.title}>Bus live pour Dakar</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>API backend</Text>
          <Text style={apiBaseUrl ? styles.value : styles.warning}>
            {apiBaseUrl || 'Configure EXPO_PUBLIC_API_BASE_URL dans un .env local'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={loading || !apiBaseUrl}
          onPress={loadBuses}
          style={({ pressed }) => [
            styles.button,
            (!apiBaseUrl || loading) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Rafraichir /api/buses</Text>}
        </Pressable>

        {error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorTitle}>Connexion non validee</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Bus detectes</Text>
          <Text style={styles.count}>{buses.length}</Text>
        </View>

        {buses.length === 0 && !loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Aucune donnee chargee</Text>
            <Text style={styles.emptyText}>Des que l'API est branchee, cette liste affichera les bus actifs.</Text>
          </View>
        ) : null}

        {buses.map((bus, index) => (
          <View key={`${bus.id ?? bus.ligne ?? 'bus'}-${index}`} style={styles.busCard}>
            <Text style={styles.busLine}>Ligne {String(bus.ligne ?? bus.id ?? index + 1)}</Text>
            <Text style={styles.busMeta}>
              {String(bus.arret_estime ?? bus.arret_signale ?? 'Position non precisee')}
            </Text>
            {bus.next_arret ? <Text style={styles.busNext}>Prochain arret: {String(bus.next_arret)}</Text> : null}
            <View style={styles.badgeRow}>
              <Text style={styles.badge}>{String(bus.tracking_mode ?? 'tracking inconnu')}</Text>
              <Text style={styles.badge}>{String(bus.confidence_level ?? 'confiance inconnue')}</Text>
            </View>
            {bus.tracking_reason || bus.confidence_reason ? (
              <Text style={styles.reason}>{String(bus.tracking_reason ?? bus.confidence_reason)}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 24,
  },
  logo: {
    borderRadius: 18,
    height: 64,
    width: 64,
  },
  titleBlock: {
    flex: 1,
  },
  kicker: {
    color: '#0c7a6b',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  title: {
    color: '#17201c',
    fontSize: 28,
    fontWeight: '800',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#e2d8c6',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  label: {
    color: '#66706b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  value: {
    color: '#17201c',
    fontSize: 14,
  },
  warning: {
    color: '#9f4b17',
    fontSize: 14,
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#0c7a6b',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    backgroundColor: '#8aa59d',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  errorPanel: {
    backgroundColor: '#fff0e6',
    borderColor: '#e6ad87',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 14,
  },
  errorTitle: {
    color: '#7a2f0c',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  errorText: {
    color: '#7a2f0c',
    fontSize: 13,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#17201c',
    fontSize: 18,
    fontWeight: '800',
  },
  count: {
    color: '#0c7a6b',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 18,
  },
  emptyTitle: {
    color: '#17201c',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyText: {
    color: '#66706b',
    fontSize: 14,
  },
  busCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2d8c6',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  busLine: {
    color: '#17201c',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  busMeta: {
    color: '#66706b',
    fontSize: 14,
    marginBottom: 6,
  },
  busNext: {
    color: '#66706b',
    fontSize: 13,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: '#e7f5f1',
    borderRadius: 6,
    color: '#0c675c',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  reason: {
    color: '#66706b',
    fontSize: 13,
    marginTop: 10,
  },
});
