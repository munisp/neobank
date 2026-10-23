import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ApiService from '../../services/ApiService';

interface VirtualAccount {
  id: string;
  account_number: string;
  account_name: string;
  label?: string;
  purpose: string;
  status: string;
}

const PURPOSES = ['collections', 'gig', 'escrow', 'savings'];

const VirtualAccountsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [purpose, setPurpose] = useState('collections');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, refetch } = useQuery('virtualAccounts', () =>
    ApiService.getVirtualAccounts()
  );
  const accounts: VirtualAccount[] = data?.virtual_accounts || [];

  const createMutation = useMutation(
    () => ApiService.createVirtualAccount({ account_name: name, label: label || undefined, purpose }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('virtualAccounts');
        setShowForm(false);
        setName('');
        setLabel('');
      },
      onError: (e: any) =>
        Alert.alert('Could not create account', e?.response?.data?.detail || 'Try again'),
    }
  );

  const freezeMutation = useMutation(
    (id: string) => ApiService.freezeVirtualAccount(id),
    { onSuccess: () => queryClient.invalidateQueries('virtualAccounts') }
  );

  const closeMutation = useMutation(
    (id: string) => ApiService.closeVirtualAccount(id),
    { onSuccess: () => queryClient.invalidateQueries('virtualAccounts') }
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const shareNumber = (va: VirtualAccount) =>
    Share.share({
      message: `Pay ${va.account_name}\nAccount: ${va.account_number}\nNeoBank${va.label ? `\n(${va.label})` : ''}`,
    });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#123B2F" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Virtual Accounts</Text>
      <Text style={styles.subtitle}>
        Dedicated account numbers for clients, deals and goals — all settling into your main wallet.
      </Text>

      <TouchableOpacity style={styles.primaryButton} onPress={() => setShowForm(!showForm)}>
        <Icon name={showForm ? 'close' : 'add'} size={20} color="#fff" />
        <Text style={styles.primaryButtonText}>{showForm ? 'Cancel' : 'New virtual account'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Account name (e.g. Adaeze Ventures)"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Label (Client: ABC Ltd, Rent 2026…)"
            value={label}
            onChangeText={setLabel}
          />
          <View style={styles.purposeRow}>
            {PURPOSES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.purposeChip, purpose === p && styles.purposeChipActive]}
                onPress={() => setPurpose(p)}
              >
                <Text style={purpose === p ? styles.purposeTextActive : styles.purposeText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, name.length < 2 && { opacity: 0.5 }]}
            disabled={name.length < 2 || createMutation.isLoading}
            onPress={() => createMutation.mutate()}
          >
            <Text style={styles.primaryButtonText}>
              {createMutation.isLoading ? 'Creating…' : 'Create account number'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {accounts.length === 0 ? (
        <View style={styles.card}>
          <Icon name="account-balance" size={36} color="#9CA3AF" style={{ alignSelf: 'center' }} />
          <Text style={styles.emptyText}>
            No virtual accounts yet. Create one and share the number with your next client.
          </Text>
        </View>
      ) : (
        accounts.map((va) => (
          <View key={va.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.accountName}>{va.account_name}</Text>
                <TouchableOpacity onPress={() => shareNumber(va)}>
                  <Text style={styles.accountNumber}>{va.account_number}</Text>
                </TouchableOpacity>
                <Text style={styles.label}>{va.label || va.purpose}</Text>
              </View>
              <View style={[styles.pill, va.status === 'active' ? styles.pillActive : styles.pillFrozen]}>
                <Text style={styles.pillText}>{va.status}</Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => freezeMutation.mutate(va.id)}>
                <Text style={styles.secondaryButtonText}>
                  {va.status === 'active' ? 'Freeze' : 'Unfreeze'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() =>
                  Alert.alert('Close account', 'The number will be retired permanently.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Close', style: 'destructive', onPress: () => closeMutation.mutate(va.id) },
                  ])
                }
              >
                <Text style={[styles.secondaryButtonText, { color: '#B91C1C' }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4, marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  accountName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  accountNumber: { fontSize: 20, fontWeight: '700', color: '#123B2F', letterSpacing: 2, marginTop: 2 },
  label: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillActive: { backgroundColor: '#D1FAE5' },
  pillFrozen: { backgroundColor: '#FEF3C7' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#123B2F', borderRadius: 10, paddingVertical: 12, marginBottom: 12, gap: 6,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryButton: {
    flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  secondaryButtonText: { color: '#374151', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: '#111827',
  },
  purposeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  purposeChip: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  purposeChipActive: { backgroundColor: '#123B2F', borderColor: '#123B2F' },
  purposeText: { color: '#374151', fontSize: 13 },
  purposeTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 8 },
});

export default VirtualAccountsScreen;
