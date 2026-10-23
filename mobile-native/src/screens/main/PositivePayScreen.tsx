import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiService from '../../services/ApiService';

const REASON_LABELS: Record<string, string> = {
  unregistered_payee: 'Unregistered payee',
  over_single_limit: 'Over single-payment limit',
  over_daily_limit: 'Over daily limit',
};

export default function PositivePayScreen() {
  const queryClient = useQueryClient();
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');

  const payees = useQuery({ queryKey: ['payees'], queryFn: () => ApiService.getPayees() });
  const exceptions = useQuery({
    queryKey: ['payment-exceptions'],
    queryFn: () => ApiService.getPaymentExceptions('open'),
  });

  const registerMutation = useMutation({
    mutationFn: () => ApiService.registerPayee({
      payee_account: account, payee_name: name,
      max_single_amount: limit ? Number(limit) : undefined,
    }),
    onSuccess: () => {
      setAccount(''); setName(''); setLimit('');
      queryClient.invalidateQueries({ queryKey: ['payees'] });
    },
    onError: (e: any) => Alert.alert('Could not register payee', e?.message || ''),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'paid' | 'rejected' }) =>
      ApiService.decidePaymentException(id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-exceptions'] }),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([payees.refetch(), exceptions.refetch()]);
    setRefreshing(false);
  }, []);

  return (
    <FlatList
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      data={payees.data || []}
      keyExtractor={(item: any) => item.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Safe Payees</Text>
          <Text style={styles.subtitle}>
            Transfers to unregistered payees are held for your review
          </Text>

          {(exceptions.data || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Pending review ({exceptions.data.length})
              </Text>
              {(exceptions.data || []).map((ex: any) => (
                <View key={ex.id} style={[styles.card, styles.exceptionCard]}>
                  <Text style={styles.payeeName}>{ex.payee_name || ex.payee_account}</Text>
                  <Text style={styles.reason}>{REASON_LABELS[ex.reason] || ex.reason}</Text>
                  <Text style={styles.amount}>₦{Number(ex.amount).toLocaleString()}</Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[styles.button, styles.payButton]}
                      onPress={() => decideMutation.mutate({ id: ex.id, decision: 'paid' })}>
                      <Text style={styles.buttonText}>Pay</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.rejectButton]}
                      onPress={() => decideMutation.mutate({ id: ex.id, decision: 'rejected' })}>
                      <Text style={styles.buttonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add payee</Text>
            <View style={styles.card}>
              <TextInput style={styles.input} placeholder="Account number"
                value={account} onChangeText={setAccount} keyboardType="number-pad" />
              <TextInput style={styles.input} placeholder="Payee name"
                value={name} onChangeText={setName} />
              <TextInput style={styles.input} placeholder="Max per payment (₦, optional)"
                value={limit} onChangeText={setLimit} keyboardType="number-pad" />
              <TouchableOpacity
                style={[styles.button, styles.payButton, (!account || !name) && { opacity: 0.5 }]}
                disabled={!account || !name || registerMutation.isPending}
                onPress={() => registerMutation.mutate()}>
                <Text style={styles.buttonText}>
                  {registerMutation.isPending ? 'Registering…' : 'Register payee'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Registered payees</Text>
        </View>
      }
      renderItem={({ item }: { item: any }) => (
        <View style={styles.card}>
          <Text style={styles.payeeName}>{item.payee_name}</Text>
          <Text style={styles.reason}>{item.payee_account}</Text>
          {item.max_single_amount && (
            <Text style={styles.limit}>
              Limit ₦{Number(item.max_single_amount).toLocaleString()}/payment
            </Text>
          )}
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No payees yet — register one above.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  exceptionCard: { borderColor: '#F59E0B', borderWidth: 1 },
  payeeName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  reason: { fontSize: 12, color: '#64748B', marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 6 },
  limit: { fontSize: 11, color: '#64748B', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  payButton: { backgroundColor: '#2563EB' },
  rejectButton: { backgroundColor: '#DC2626' },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
    padding: 10, marginBottom: 8, fontSize: 14, backgroundColor: '#FFFFFF',
  },
  empty: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 8 },
});
