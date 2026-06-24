import { StyleSheet, Text, View } from 'react-native';
import type { Bus } from '../api';

const trackingLabels: Record<Bus['tracking_mode'], string> = {
  live_gps: 'GPS live',
  community: 'Confirme',
  estimated: 'Estime',
};

const confidenceLabels: Record<Bus['confidence_level'], string> = {
  high: 'Forte',
  medium: 'Moyenne',
  low: 'Faible',
};

const confidenceColors: Record<Bus['confidence_level'], { bg: string; fg: string }> = {
  high: { bg: '#e6f6ec', fg: '#126234' },
  medium: { bg: '#fff5d6', fg: '#80610f' },
  low: { bg: '#ffe7e2', fg: '#973622' },
};

function formatMinutes(value: number) {
  if (value < 1) return 'a l instant';
  if (value < 60) return `il y a ${Math.round(value)} min`;
  return `il y a ${Math.round(value / 60)} h`;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

type Props = { bus: Bus };

export function BusCard({ bus }: Props) {
  const confidence = confidenceColors[bus.confidence_level];
  const progress = clampProgress(bus.progress_to_next);
  const routeWindow = bus.route_window.slice(0, 6);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.lineBadge}>
          <Text selectable style={styles.lineLabel}>Ligne</Text>
          <Text selectable style={styles.lineValue}>{bus.ligne}</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text selectable style={styles.stopName}>{bus.arret_estime || bus.arret_signale}</Text>
          <Text selectable style={styles.freshness}>{formatMinutes(bus.minutes_depuis_signalement)}</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <Text style={styles.modeBadge}>{trackingLabels[bus.tracking_mode]}</Text>
        <Text style={[styles.confidenceBadge, { backgroundColor: confidence.bg, color: confidence.fg }]}>
          {confidenceLabels[bus.confidence_level]}
        </Text>
        <Text style={styles.countBadge}>{bus.confirmation_count + bus.go_sessions_count} preuves</Text>
      </View>

      {bus.next_arret ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text selectable style={styles.progressLabel}>Vers {bus.next_arret}</Text>
            <Text selectable style={styles.progressValue}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>
      ) : null}

      {bus.au_terminus && bus.repart_dans_min !== null ? (
        <Text selectable style={styles.terminus}>Au terminus, repart dans {bus.repart_dans_min} min</Text>
      ) : null}

      {routeWindow.length > 0 ? (
        <View style={styles.timeline}>
          {routeWindow.map((stop) => (
            <View key={`${bus.ligne}-${stop.index}-${stop.nom}`} style={styles.timelineItem}>
              <View style={[styles.dot, stop.state === 'current' && styles.dotCurrent, stop.state === 'passed' && styles.dotPassed]} />
              <Text selectable numberOfLines={1} style={[styles.timelineText, stop.state === 'current' && styles.timelineCurrent]}>{stop.nom}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderColor: '#dce6df', borderRadius: 8, borderWidth: 1, gap: 14, padding: 14 },
  topRow: { flexDirection: 'row', gap: 12 },
  lineBadge: { alignItems: 'center', backgroundColor: '#12201a', borderRadius: 8, justifyContent: 'center', minWidth: 70, paddingHorizontal: 10, paddingVertical: 10 },
  lineLabel: { color: '#b7c8bf', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  lineValue: { color: '#ffffff', fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '900' },
  metaBlock: { flex: 1, gap: 4, justifyContent: 'center' },
  stopName: { color: '#101915', fontSize: 17, fontWeight: '900', lineHeight: 22 },
  freshness: { color: '#64726b', fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeBadge: { backgroundColor: '#e7f2ff', borderRadius: 6, color: '#174f8a', fontSize: 12, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 6 },
  confidenceBadge: { borderRadius: 6, fontSize: 12, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 6 },
  countBadge: { backgroundColor: '#f0ecff', borderRadius: 6, color: '#4c3b8f', fontSize: 12, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 6 },
  progressBlock: { gap: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  progressLabel: { color: '#34423b', flex: 1, fontSize: 13, fontWeight: '800' },
  progressValue: { color: '#116a5c', fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900' },
  progressTrack: { backgroundColor: '#edf1ee', borderRadius: 999, height: 8, overflow: 'hidden' },
  progressFill: { backgroundColor: '#12a37f', borderRadius: 999, height: 8 },
  terminus: { backgroundColor: '#fff5d6', borderRadius: 6, color: '#755515', fontSize: 13, fontWeight: '800', padding: 10 },
  timeline: { gap: 8 },
  timelineItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dot: { backgroundColor: '#cbd6d0', borderRadius: 5, height: 10, width: 10 },
  dotCurrent: { backgroundColor: '#12a37f', height: 12, width: 12 },
  dotPassed: { backgroundColor: '#71827a' },
  timelineText: { color: '#64726b', flex: 1, fontSize: 12, fontWeight: '700' },
  timelineCurrent: { color: '#111916', fontWeight: '900' },
});
