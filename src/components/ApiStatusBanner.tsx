import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, formatApiError } from '../errors';

type Props = {
  apiBaseUrl: string;
  deviceLabel: string | null;
  error: ApiError | null;
  loading: boolean;
  onRetry: () => void;
};

export function ApiStatusBanner({ apiBaseUrl, deviceLabel, error, loading, onRetry }: Props) {
  const configured = apiBaseUrl.length > 0;
  const tone = !configured ? 'warn' : error ? 'error' : 'ready';

  return (
    <View style={[styles.banner, styles[tone]]}>
      <View style={styles.copy}>
        <Text selectable style={styles.eyebrow}>{configured ? 'Backend' : 'Configuration'}</Text>
        <Text selectable style={styles.title}>{configured ? apiBaseUrl : 'API backend non configuree'}</Text>
        <Text selectable style={styles.detail}>
          {error ? formatApiError(error) : configured ? `Device ${deviceLabel ?? '...' }` : 'Ajoute l URL backend publique ou locale dans .env.'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={loading || !configured}
        onPress={onRetry}
        style={({ pressed }) => [styles.button, (!configured || loading) && styles.buttonDisabled, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{loading ? '...' : 'Reessayer'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  ready: { backgroundColor: '#eef7f2', borderColor: '#b8dac7' },
  warn: { backgroundColor: '#fff7e8', borderColor: '#e8c47b' },
  error: { backgroundColor: '#fff0ee', borderColor: '#e3a39a' },
  copy: { flex: 1, gap: 4 },
  eyebrow: { color: '#53615b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#111916', fontSize: 14, fontWeight: '800' },
  detail: { color: '#53615b', fontSize: 13, lineHeight: 18 },
  button: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#116a5c', borderRadius: 8, minHeight: 38, justifyContent: 'center', paddingHorizontal: 12 },
  buttonDisabled: { backgroundColor: '#9aa9a2' },
  buttonPressed: { opacity: 0.86 },
  buttonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});
