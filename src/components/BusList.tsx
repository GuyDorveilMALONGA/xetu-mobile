import { StyleSheet, Text, View } from 'react-native';
import type { Bus } from '../api';
import { BusCard } from './BusCard';

type Props = {
  buses: Bus[];
  loading: boolean;
};

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonTop}>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonCopy}>
          <View style={styles.skeletonWide} />
          <View style={styles.skeletonShort} />
        </View>
      </View>
      <View style={styles.skeletonBar} />
      <View style={styles.skeletonMiniRow}>
        <View style={styles.skeletonMini} />
        <View style={styles.skeletonMini} />
      </View>
    </View>
  );
}

export function BusList({ buses, loading }: Props) {
  if (loading && buses.length === 0) {
    return (
      <View style={styles.list}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (!loading && buses.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text selectable style={styles.emptyTitle}>Aucun bus signale recemment</Text>
        <Text selectable style={styles.emptyText}>Reessaie dans quelques instants ou signale un bus depuis la prochaine tranche.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {buses.map((bus, index) => (
        <BusCard key={`${bus.ligne}-${bus.arret_estime}-${index}`} bus={bus} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  emptyState: { backgroundColor: '#ffffff', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, gap: 6, padding: 18 },
  emptyTitle: { color: '#111916', fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#63716a', fontSize: 14, lineHeight: 20 },
  skeletonCard: { backgroundColor: '#ffffff', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, gap: 14, padding: 14 },
  skeletonTop: { flexDirection: 'row', gap: 12 },
  skeletonLine: { backgroundColor: '#dfe8e3', borderRadius: 8, height: 62, width: 70 },
  skeletonCopy: { flex: 1, gap: 10, justifyContent: 'center' },
  skeletonWide: { backgroundColor: '#e8eee9', borderRadius: 6, height: 16, width: '82%' },
  skeletonShort: { backgroundColor: '#eef3ef', borderRadius: 6, height: 12, width: '46%' },
  skeletonBar: { backgroundColor: '#e8eee9', borderRadius: 999, height: 8, width: '100%' },
  skeletonMiniRow: { flexDirection: 'row', gap: 8 },
  skeletonMini: { backgroundColor: '#eef3ef', borderRadius: 6, height: 24, width: 84 },
});
