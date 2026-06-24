import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bus, fetchBuses } from '../api';
import { BusList } from '../components/BusList';
import { ApiError, toApiError } from '../errors';

type Props = {
  followedLines: string[];
  pendingLines: string[];
  onToggleLine: (ligne: string) => void;
};

export function MyLinesScreen({ followedLines, pendingLines, onToggleLine }: Props) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const loadBuses = useCallback(async () => {
    if (followedLines.length === 0) {
      setBuses([]);
      return;
    }
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
  }, [followedLines.length]);

  useEffect(() => {
    void loadBuses();
  }, [loadBuses]);

  const filteredBuses = buses.filter((bus) => followedLines.includes(bus.ligne));

  if (followedLines.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📌</Text>
        <Text style={styles.emptyTitle}>Aucune ligne suivie</Text>
        <Text style={styles.emptyText}>
          Rends-toi dans l'onglet Recherche pour ajouter des lignes de bus a tes favoris.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadBuses} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Mes Lignes</Text>
        <Text style={styles.subtitle}>Retrouve rapidement l'etat des lignes que tu empruntes.</Text>
      </View>

      <View style={styles.linesSection}>
        <Text style={styles.sectionLabel}>Lignes suivies ({followedLines.length})</Text>
        <View style={styles.chipsRow}>
          {followedLines.map((ligne) => {
            const isPending = pendingLines.includes(ligne);
            return (
              <Pressable
                key={ligne}
                accessibilityRole="button"
                accessibilityLabel={`Ne plus suivre la ligne ${ligne}`}
                disabled={isPending}
                onPress={() => onToggleLine(ligne)}
                style={({ pressed }) => [
                  styles.chip,
                  isPending && styles.chipPending,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.chipText}>Ligne {ligne}</Text>
                <Text style={styles.chipDelete}>{isPending ? '...' : '×'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.busSection}>
        <Text style={styles.sectionLabel}>Bus en direct sur tes lignes</Text>
        {error && !loading && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>Erreur de chargement des bus : {error.message}</Text>
          </View>
        )}

        {!error && !loading && filteredBuses.length === 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>Aucun bus en circulation sur tes lignes suivies pour le moment.</Text>
          </View>
        )}

        {(loading || filteredBuses.length > 0) && (
          <BusList buses={filteredBuses} loading={loading} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20, padding: 14, paddingBottom: 36 },
  header: { gap: 4 },
  title: { color: '#101915', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#5c6a63', fontSize: 14, lineHeight: 20 },
  linesSection: { gap: 10 },
  sectionLabel: { color: '#64726b', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cedbd2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipPending: {
    opacity: 0.5,
    backgroundColor: '#f0f4f1',
  },
  chipText: { color: '#101915', fontSize: 13, fontWeight: '800' },
  chipDelete: { color: '#973622', fontSize: 16, fontWeight: '900', paddingLeft: 2 },
  pressed: { opacity: 0.75 },
  busSection: { gap: 12 },
  errorCard: { backgroundColor: '#fff0ee', borderColor: '#e3a39a', borderRadius: 8, borderWidth: 1, padding: 12 },
  errorText: { color: '#973622', fontSize: 13, fontWeight: '700' },
  infoCard: { backgroundColor: '#ffffff', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, padding: 14 },
  infoText: { color: '#53615b', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24, paddingVertical: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: '#101915', fontSize: 18, fontWeight: '900' },
  emptyText: { color: '#5c6a63', fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
