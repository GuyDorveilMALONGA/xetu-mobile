import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchStops, StopSearchResult } from '../api';
import { ApiError } from '../errors';

type Props = {
  followedLines: string[];
  pendingLines: string[];
  onToggleLine: (ligne: string) => void;
};

export function SearchScreen({ followedLines, pendingLines, onToggleLine }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<StopSearchResult[]>([]);
  const [viaSecteur, setViaSecteur] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setViaSecteur(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    let active = true;

    const handler = setTimeout(async () => {
      try {
        const res = await searchStops(trimmed, undefined, undefined, controller.signal);
        if (active) {
          setResults(res.stops);
          setViaSecteur(res.via_secteur ?? null);
        }
      } catch (err) {
        if (!active) return;
        // Ignore aborted requests, otherwise handle
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (err instanceof ApiError) {
          setError(err);
        } else {
          setError(new ApiError('network', 'Impossible de joindre le serveur.'));
        }
        setResults([]);
        setViaSecteur(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(handler);
      controller.abort();
    };
  }, [query]);

  return (
    <View style={styles.screen}>
      <View style={styles.searchContainer}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder="Rechercher un arret ou quartier (ex: Liberte 4)"
          placeholderTextColor="#86958e"
          style={styles.input}
          value={query}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#116a5c" size="large" />
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Erreur de recherche</Text>
            <Text style={styles.errorText}>{error.message}</Text>
          </View>
        )}

        {query.trim().length > 0 && query.trim().length < 2 && (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>Tape au moins 2 caracteres pour lancer la recherche.</Text>
          </View>
        )}

        {!loading && query.trim().length >= 2 && results.length === 0 && !error && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aucun arret trouve</Text>
            <Text style={styles.emptyText}>Essaie un autre nom d'arret ou un nom de quartier (ex: Medina, Castors, Liberte).</Text>
          </View>
        )}

        {viaSecteur && !loading && (
          <View style={styles.secteurBanner}>
            <Text style={styles.secteurLabel}>Resultats via le secteur :</Text>
            <Text style={styles.secteurValue}>{viaSecteur}</Text>
          </View>
        )}

        {!loading && results.length > 0 && (
          <View style={styles.list}>
            {results.map((stop) => (
              <View key={stop.nom} style={styles.stopCard}>
                <View style={styles.stopHeader}>
                  <Text selectable style={styles.stopName}>{stop.nom}</Text>
                  {stop.distance_m !== null && stop.distance_m !== undefined && (
                    <Text selectable style={styles.stopDistance}>{stop.distance_m} m</Text>
                  )}
                </View>

                <View style={styles.linesSection}>
                  <Text style={styles.sectionLabel}>Lignes desservies :</Text>
                  <View style={styles.chipsRow}>
                    {stop.lignes.map((line) => {
                      const isFollowed = followedLines.includes(line.numero);
                      const isPending = pendingLines.includes(line.numero);
                      return (
                        <View key={line.numero} style={styles.lineChipWrapper}>
                          <View style={[styles.chip, line.has_recent ? styles.chipRecent : styles.chipIdle]}>
                            <Text style={[styles.chipText, line.has_recent ? styles.chipTextRecent : styles.chipTextIdle]}>
                              Ligne {line.numero}
                            </Text>
                            {line.last_seen_min !== null && line.last_seen_min !== undefined && (
                              <Text style={styles.seenTime}> ({line.last_seen_min}m)</Text>
                            )}
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              isFollowed
                                ? `Ne plus suivre la ligne ${line.numero}`
                                : `Suivre la ligne ${line.numero}`
                            }
                            disabled={isPending}
                            onPress={() => onToggleLine(line.numero)}
                            style={({ pressed }) => [
                              styles.followButton,
                              isFollowed && styles.followButtonActive,
                              isPending && styles.followButtonPending,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.followText, isFollowed && styles.followTextActive]}>
                              {isPending ? '...' : isFollowed ? '★' : '☆'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchContainer: { backgroundColor: '#ffffff', borderBottomColor: '#dce6df', borderBottomWidth: 1, padding: 14 },
  input: {
    backgroundColor: '#f4f7f1',
    borderColor: '#cedbd2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#101915',
    fontSize: 15,
    fontWeight: '700',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  scrollContainer: { padding: 14, paddingBottom: 36 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36 },
  list: { gap: 12 },
  stopCard: { backgroundColor: '#ffffff', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, gap: 12, padding: 14 },
  stopHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  stopName: { color: '#101915', flex: 1, fontSize: 16, fontWeight: '900', lineHeight: 22 },
  stopDistance: { color: '#116a5c', fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '800' },
  linesSection: { gap: 8 },
  sectionLabel: { color: '#64726b', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lineChipWrapper: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  chip: { borderRadius: 6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5 },
  chipRecent: { backgroundColor: '#e6f6ec' },
  chipIdle: { backgroundColor: '#f0f4f1' },
  chipText: { fontSize: 12, fontWeight: '800' },
  chipTextRecent: { color: '#126234' },
  chipTextIdle: { color: '#53615b' },
  seenTime: { fontSize: 10, fontWeight: '700', opacity: 0.8 },
  followButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cedbd2',
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 28,
    justifyContent: 'center',
    width: 28,
  },
  followButtonActive: { backgroundColor: '#fff7e8', borderColor: '#e8c47b' },
  followButtonPending: { opacity: 0.5, backgroundColor: '#f0f4f1' },
  followText: { color: '#53615b', fontSize: 15, lineHeight: 18 },
  followTextActive: { color: '#c48f12' },
  pressed: { opacity: 0.7 },
  errorCard: { backgroundColor: '#fff0ee', borderColor: '#e3a39a', borderRadius: 8, borderWidth: 1, gap: 4, padding: 14 },
  errorTitle: { color: '#973622', fontSize: 14, fontWeight: '900' },
  errorText: { color: '#973622', fontSize: 13, lineHeight: 18 },
  hintCard: { backgroundColor: '#f4f7f1', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, padding: 14 },
  hintText: { color: '#53615b', fontSize: 13, lineHeight: 18 },
  emptyCard: { backgroundColor: '#ffffff', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, gap: 4, padding: 14 },
  emptyTitle: { color: '#101915', fontSize: 14, fontWeight: '900' },
  emptyText: { color: '#53615b', fontSize: 13, lineHeight: 18 },
  secteurBanner: {
    backgroundColor: '#eef7f2',
    borderColor: '#b8dac7',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    padding: 12,
  },
  secteurLabel: { color: '#126234', fontSize: 13, fontWeight: '800' },
  secteurValue: { color: '#126234', fontSize: 13, fontWeight: '900' },
});
