import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ApiService from '../../services/ApiService';

interface Suggestion { suggestion_id: string; label: string; score: number }
interface Pattern {
  counterparty: string; cadence: string; average_amount: number;
  occurrences: number; days_until?: number;
}

export default function IntelligenceScreen() {
  const queryClient = useQueryClient();
  const nextActions = useQuery(['nextActions'], () => ApiService.getNextActions());
  const dueSoon = useQuery(['dueSoon'], () => ApiService.getDueSoon());
  const recurring = useQuery(['recurring'], () => ApiService.getRecurringPatterns());

  const refreshing = nextActions.isRefetching || dueSoon.isRefetching || recurring.isRefetching;
  const onRefresh = () => {
    queryClient.invalidateQueries(['nextActions']);
    queryClient.invalidateQueries(['dueSoon']);
    queryClient.invalidateQueries(['recurring']);
  };

  const feedback = async (suggestionId: string, accepted: boolean) => {
    try {
      await ApiService.sendSuggestionFeedback(suggestionId, accepted);
      queryClient.invalidateQueries(['nextActions']);
    } catch {
      // swallow — feedback is best-effort instrumentation
    }
  };

  const suggestions: Suggestion[] = nextActions.data?.suggestions ?? [];
  const due: Pattern[] = dueSoon.data?.due ?? [];
  const patterns: Pattern[] = recurring.data?.patterns ?? [];

  return (
    <FlatList
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={<Text style={styles.title}>Smart For You</Text>}
      data={[{ key: 'sections' }]}
      renderItem={() => (
        <View>
          <Text style={styles.section}>Suggested next actions</Text>
          {suggestions.length === 0 && (
            <Text style={styles.muted}>Use the app a little more and suggestions will appear here.</Text>
          )}
          {suggestions.map((s) => (
            <View key={s.suggestion_id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{s.label}</Text>
                <Text style={styles.muted}>{Math.round(s.score * 100)}% likely</Text>
              </View>
              <TouchableOpacity onPress={() => feedback(s.suggestion_id, true)} style={styles.actionBtn}>
                <Text>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => feedback(s.suggestion_id, false)} style={styles.actionBtn}>
                <Text>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ))}

          <Text style={styles.section}>Coming up</Text>
          {due.length === 0 && <Text style={styles.muted}>No recurring payments due soon.</Text>}
          {due.map((p) => (
            <View key={p.counterparty} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{p.counterparty}</Text>
                <Text style={styles.muted}>{p.cadence} · avg {p.average_amount}</Text>
              </View>
              <Text style={styles.badge}>
                {(p.days_until ?? 0) <= 0 ? 'due now' : `in ${p.days_until}d`}
              </Text>
            </View>
          ))}

          <Text style={styles.section}>Detected recurring payments</Text>
          {patterns.length === 0 && (
            <Text style={styles.muted}>No patterns detected yet.</Text>
          )}
          {patterns.map((p) => (
            <View key={p.counterparty} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{p.counterparty}</Text>
                <Text style={styles.muted}>{p.occurrences}× {p.cadence}</Text>
              </View>
              <Text>{p.average_amount}</Text>
            </View>
          ))}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  muted: { fontSize: 12, opacity: 0.6 },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderRadius: 10, backgroundColor: '#fff', marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardTitle: { fontSize: 14, fontWeight: '500', textTransform: 'capitalize' },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4, marginLeft: 4 },
  badge: { fontSize: 12, fontWeight: '600' },
});
