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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ApiService from '../../services/ApiService';

interface EscrowDeal {
  id: string;
  title?: string;
  description?: string;
  amount?: number;
  total_amount?: number;
  status?: string;
  reference?: string;
}

const fmt = (n: any) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

// "ada:60, chidi:40" → [{user_id, contribution_percentage}]
const parseParties = (text: string, key: string) =>
  text.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [id, pct] = s.split(':').map((x) => x.trim());
    return { user_id: id, [key]: Number(pct || 0) };
  });

const EscrowScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [multiparty, setMultiparty] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [buyers, setBuyers] = useState('');
  const [sellers, setSellers] = useState('');
  const [approvals, setApprovals] = useState('all');
  const [fee, setFee] = useState('');

  const { data, isLoading, refetch } = useQuery('escrows', () => ApiService.getEscrows());
  const deals: EscrowDeal[] = data?.escrows || data?.items || (Array.isArray(data) ? data : []);

  const createMutation = useMutation(
    () =>
      multiparty
        ? ApiService.createMultipartyEscrow({
            title,
            total_amount: Number(amount),
            buyers: parseParties(buyers, 'contribution_percentage'),
            sellers: parseParties(sellers, 'distribution_percentage'),
            approval_config: { approval_type: approvals, required_approvals: parseParties(buyers, 'x').length },
            ...(fee ? { fee_percentage: Number(fee) } : {}),
            escrow_type: 'general',
          })
        : ApiService.createEscrow({ title, amount: Number(amount), counterparty }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('escrows');
        setShowForm(false);
        setTitle(''); setAmount(''); setCounterparty('');
        setBuyers(''); setSellers(''); setFee('');
      },
      onError: (e: any) =>
        Alert.alert('Could not create deal', e?.response?.data?.detail || 'Try again'),
    }
  );

  const expiryMutation = useMutation(
    (id: string) => ApiService.checkEscrowExpiry(id),
    {
      onSuccess: (res) => {
        queryClient.invalidateQueries('escrows');
        if (res?.expired) Alert.alert('Deal expired', `${fmt(res.total_refunded)} auto-refunded to buyers.`);
      },
    }
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#123B2F" />
      </View>
    );
  }

  const canSubmit = title.length > 1 && Number(amount) > 0 && (!multiparty || (buyers && sellers));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Escrow</Text>
      <Text style={styles.subtitle}>Buy and sell with strangers, minus the stranger danger.</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={() => setShowForm(!showForm)}>
        <Icon name={showForm ? 'close' : 'add'} size={20} color="#fff" />
        <Text style={styles.primaryButtonText}>{showForm ? 'Cancel' : 'New protected deal'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="What are you trading?" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Amount (₦)" keyboardType="numeric" value={amount} onChangeText={setAmount} />
          {!multiparty && (
            <TextInput style={styles.input} placeholder="Counterparty (phone or email)" value={counterparty} onChangeText={setCounterparty} />
          )}
          <TouchableOpacity onPress={() => setMultiparty(!multiparty)}>
            <Text style={styles.link}>
              {multiparty ? '− Switch back to a simple deal' : '+ Group deal? Multiple buyers, sellers or co-owners'}
            </Text>
          </TouchableOpacity>
          {multiparty && (
            <>
              <Text style={styles.hint}>Format: userId:percent, comma-separated. Each side totals 100.</Text>
              <TextInput style={styles.input} placeholder="Buyers — ada:60, chidi:40" value={buyers} onChangeText={setBuyers} />
              <TextInput style={styles.input} placeholder="Sellers — obi:75, ngozi:25" value={sellers} onChangeText={setSellers} />
              <View style={styles.row}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Approval rule: all · majority · any" value={approvals} onChangeText={setApprovals} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Fee % (opt.)" keyboardType="numeric" value={fee} onChangeText={setFee} />
              </View>
            </>
          )}
          <TouchableOpacity
            style={[styles.primaryButton, !canSubmit && { opacity: 0.5 }]}
            disabled={!canSubmit || createMutation.isLoading}
            onPress={() => createMutation.mutate()}
          >
            <Text style={styles.primaryButtonText}>
              {createMutation.isLoading ? 'Creating…' : multiparty ? 'Create group escrow' : 'Create protected deal'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {deals.length === 0 ? (
        <View style={styles.card}>
          <Icon name="handshake" size={36} color="#9CA3AF" style={{ alignSelf: 'center' }} />
          <Text style={styles.emptyText}>No deals yet. Create one and share the link with your buyer or seller.</Text>
        </View>
      ) : (
        deals.map((d) => (
          <View key={d.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dealTitle}>{d.title || d.description}</Text>
                <Text style={styles.label}>{fmt(d.amount || d.total_amount)} · {d.reference || String(d.id).slice(0, 8)}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{d.status || 'created'}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.secondaryButton, { marginTop: 10 }]} onPress={() => expiryMutation.mutate(d.id)}>
              <Text style={styles.secondaryButtonText}>Check deadline / expiry</Text>
            </TouchableOpacity>
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
  dealTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  label: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#EEF2FF' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#123B2F', borderRadius: 10, paddingVertical: 12, marginBottom: 12, gap: 6,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  secondaryButtonText: { color: '#374151', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: '#111827',
  },
  row: { flexDirection: 'row', gap: 8 },
  link: { color: '#123B2F', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  hint: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 8 },
});

export default EscrowScreen;
