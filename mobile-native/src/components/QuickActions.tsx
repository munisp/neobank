import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

interface QuickAction {
  id: string;
  title: string;
  icon: string;
  color: string;
  screen: string;
  params?: any;
}

const quickActions: QuickAction[] = [
  {
    id: 'transfer',
    title: 'Transfer',
    icon: 'bank-transfer',
    color: '#2196f3',
    screen: 'Transfer',
  },
  {
    id: 'pay-bill',
    title: 'Pay Bill',
    icon: 'receipt',
    color: '#4caf50',
    screen: 'BillReminders',
  },
  {
    id: 'deposit',
    title: 'Deposit',
    icon: 'cash-plus',
    color: '#9c27b0',
    screen: 'Deposit',
  },
  {
    id: 'scan-qr',
    title: 'Scan QR',
    icon: 'qrcode-scan',
    color: '#ff9800',
    screen: 'QRScanner',
  },
  {
    id: 'buy-stocks',
    title: 'Buy Stocks',
    icon: 'chart-line',
    color: '#00bcd4',
    screen: 'StockTrading',
  },
  {
    id: 'crypto',
    title: 'Crypto',
    icon: 'bitcoin',
    color: '#ff5722',
    screen: 'Cryptocurrency',
  },
  {
    id: 'loan',
    title: 'Apply Loan',
    icon: 'hand-coin',
    color: '#795548',
    screen: 'LoanApplication',
  },
  {
    id: 'cards',
    title: 'My Cards',
    icon: 'credit-card-multiple',
    color: '#607d8b',
    screen: 'Cards',
  },
];

export default function QuickActions() {
  const navigation = useNavigation();

  const handleActionPress = async (action: QuickAction) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(action.screen as never, action.params as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Actions</Text>
        <TouchableOpacity>
          <Icon name="dots-horizontal" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.actionButton}
            onPress={() => handleActionPress(action)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: action.color + '20' }]}>
              <Icon name={action.icon} size={28} color={action.color} />
            </View>
            <Text style={styles.actionTitle}>{action.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  actionButton: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 80,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

