import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bus } from '../api';
import { ApiStatusBanner } from '../components/ApiStatusBanner';
import { BusList } from '../components/BusList';
import { ApiError } from '../errors';

type Props = {
  buses: Bus[];
  loading: boolean;
  error: ApiError | null;
  apiBaseUrl: string;
  deviceLabel: string | null;
  onRefresh: () => void;
};

export function LiveScreen({ buses, loading, error, apiBaseUrl, deviceLabel, onRefresh }: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} enabled={apiBaseUrl.length > 0} />}
    >
      <View style={styles.hero}>
        <Text selectable style={styles.kicker}>Xetu Mobile</Text>
        <Text selectable style={styles.title}>Bus live pour Dakar</Text>
        <Text selectable style={styles.subtitle}>Positions estimees, fraicheur du signal et confiance communautaire.</Text>
      </View>

      <ApiStatusBanner
        apiBaseUrl={apiBaseUrl}
        deviceLabel={deviceLabel}
        error={error}
        loading={loading}
        onRetry={onRefresh}
      />

      <View style={styles.sectionHeader}>
        <View>
          <Text selectable style={styles.sectionTitle}>Bus detectes</Text>
          <Text selectable style={styles.sectionSubtitle}>Tries du signal le plus recent au plus ancien</Text>
        </View>
        <Text selectable style={styles.count}>{buses.length}</Text>
      </View>

      <BusList buses={buses} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 18, paddingBottom: 36 },
  hero: { gap: 8 },
  kicker: { color: '#116a5c', fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: '#101915', fontSize: 30, fontWeight: '900', lineHeight: 36 },
  subtitle: { color: '#5c6a63', fontSize: 15, lineHeight: 22, maxWidth: 560 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  sectionTitle: { color: '#101915', fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: '#64726b', fontSize: 13, lineHeight: 18, marginTop: 3 },
  count: { color: '#116a5c', fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '900' },
});
