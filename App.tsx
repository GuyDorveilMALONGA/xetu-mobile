import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addSubscription, Bus, fetchBuses, getSubscriptions, removeSubscription } from './src/api';
import { getApiBaseUrl } from './src/config';
import { ApiError, toApiError } from './src/errors';
import { getDeviceId, getPhoneSurrogate } from './src/identity';
import { LiveScreen } from './src/screens/LiveScreen';
import { MyLinesScreen } from './src/screens/MyLinesScreen';
import { SearchScreen } from './src/screens/SearchScreen';

type Tab = 'live' | 'search' | 'lines' | 'report' | 'route' | 'leaderboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [buses, setBuses] = useState<Bus[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [followedLines, setFollowedLines] = useState<string[]>([]);
  const [pendingLines, setPendingLines] = useState<string[]>([]);
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

  const loadSubscriptions = useCallback(async (id: string) => {
    try {
      const lines = await getSubscriptions(id);
      setFollowedLines(lines);
    } catch (err) {
      console.warn('Failed to load subscriptions:', err);
    }
  }, []);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    setDeviceLabel(getPhoneSurrogate(id));
    if (apiBaseUrl) {
      void loadSubscriptions(id);
      void loadBuses();
    }
  }, [apiBaseUrl, loadSubscriptions, loadBuses]);

  const toggleLine = async (ligne: string) => {
    // Prevent concurrent mutations for the same line
    if (pendingLines.includes(ligne)) {
      return;
    }

    const isFollowed = followedLines.includes(ligne);
    const previousLines = [...followedLines];

    // Mark line as mutating
    setPendingLines((prev) => [...prev, ligne]);

    // Optimistic UI update
    if (isFollowed) {
      setFollowedLines((prev) => prev.filter((l) => l !== ligne));
    } else {
      setFollowedLines((prev) => [...prev, ligne]);
    }

    try {
      if (isFollowed) {
        await removeSubscription(deviceId, ligne);
      } else {
        await addSubscription(deviceId, ligne);
      }
    } catch (err) {
      // Rollback on error
      setFollowedLines(previousLines);
      alert(`Impossible de modifier le favori pour la Ligne ${ligne}.`);
    } finally {
      // Unmark line as mutating
      setPendingLines((prev) => prev.filter((l) => l !== ligne));
    }
  };

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'live':
        return (
          <LiveScreen
            apiBaseUrl={apiBaseUrl}
            buses={sortedBuses}
            deviceLabel={deviceLabel}
            error={error}
            loading={loading}
            onRefresh={loadBuses}
          />
        );
      case 'search':
        return (
          <SearchScreen
            followedLines={followedLines}
            pendingLines={pendingLines}
            onToggleLine={toggleLine}
          />
        );
      case 'lines':
        return (
          <MyLinesScreen
            followedLines={followedLines}
            pendingLines={pendingLines}
            onToggleLine={toggleLine}
          />
        );
      default:
        return (
          <LiveScreen
            apiBaseUrl={apiBaseUrl}
            buses={sortedBuses}
            deviceLabel={deviceLabel}
            error={error}
            loading={loading}
            onRefresh={loadBuses}
          />
        );
    }
  };

  return (
    <View style={styles.appContainer}>
      <StatusBar style="dark" />
      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      {/* Custom Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Onglet Live"
          onPress={() => setActiveTab('live')}
          style={styles.tab}
        >
          <Text style={[styles.tabIcon, activeTab === 'live' && styles.tabIconActive]}>🟢</Text>
          <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>Live</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Onglet Recherche"
          onPress={() => setActiveTab('search')}
          style={styles.tab}
        >
          <Text style={[styles.tabIcon, activeTab === 'search' && styles.tabIconActive]}>🔍</Text>
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>Recherche</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Onglet Mes Lignes"
          onPress={() => setActiveTab('lines')}
          style={styles.tab}
        >
          <Text style={[styles.tabIcon, activeTab === 'lines' && styles.tabIconActive]}>📌</Text>
          <Text style={[styles.tabText, activeTab === 'lines' && styles.tabTextActive]}>Mes lignes</Text>
        </Pressable>

        {/* Disabled placeholders for Lot B / Lot C */}
        <View style={[styles.tab, styles.tabDisabled]}>
          <Text style={styles.tabIconDisabled}>📣</Text>
          <Text style={styles.tabTextDisabled}>Signaler</Text>
        </View>

        <View style={[styles.tab, styles.tabDisabled]}>
          <Text style={styles.tabIconDisabled}>🗺️</Text>
          <Text style={styles.tabTextDisabled}>Route</Text>
        </View>

        <View style={[styles.tab, styles.tabDisabled]}>
          <Text style={styles.tabIconDisabled}>🏆</Text>
          <Text style={styles.tabTextDisabled}>Top</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#f4f7f1',
  },
  screenContainer: {
    flex: 1,
    paddingTop: 54, // Safe padding top
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#cedbd2',
    borderTopWidth: 1,
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-around',
    paddingBottom: 4,
    paddingTop: 6,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  tabDisabled: {
    opacity: 0.35,
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabIconActive: {
    transform: [{ scale: 1.1 }],
  },
  tabIconDisabled: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabText: {
    color: '#64726b',
    fontSize: 11,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#116a5c',
  },
  tabTextDisabled: {
    color: '#86958e',
    fontSize: 11,
    fontWeight: '800',
  },
});
