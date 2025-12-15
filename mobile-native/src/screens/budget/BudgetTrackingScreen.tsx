import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ProgressBar } from 'react-native-paper';
import ApiService from '../../services/ApiService';

interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  icon: string;
  color: string;
}

export default function BudgetTrackingScreen() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');

  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    try {
      const data = await ApiService.getBudgets();
      setBudgets(data);
    } catch (error) {
      console.error('Failed to load budgets:', error);
    }
  };

  const saveBudget = async () => {
    try {
      if (editingBudget) {
        await ApiService.updateBudget(editingBudget.id, {
          category,
          limit: parseFloat(limit),
        });
      } else {
        await ApiService.createBudget({
          category,
          limit: parseFloat(limit),
        });
      }
      setModalVisible(false);
      loadBudgets();
    } catch (error) {
      Alert.alert('Error', 'Failed to save budget');
    }
  };

  const deleteBudget = async (id: string) => {
    Alert.alert('Delete Budget', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await ApiService.deleteBudget(id);
          loadBudgets();
        },
      },
    ]);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return '#f44336';
    if (percentage >= 80) return '#ff9800';
    return '#4caf50';
  };

  const renderBudgetCard = (budget: Budget) => {
    const percentage = (budget.spent / budget.limit) * 100;
    const remaining = budget.limit - budget.spent;

    return (
      <TouchableOpacity
        key={budget.id}
        style={styles.budgetCard}
        onPress={() => {
          setEditingBudget(budget);
          setCategory(budget.category);
          setLimit(budget.limit.toString());
          setModalVisible(true);
        }}
      >
        <View style={styles.budgetHeader}>
          <View style={styles.budgetLeft}>
            <View style={[styles.iconContainer, { backgroundColor: budget.color + '20' }]}>
              <Icon name={budget.icon} size={24} color={budget.color} />
            </View>
            <View>
              <Text style={styles.budgetCategory}>{budget.category}</Text>
              <Text style={styles.budgetLimit}>${budget.limit.toLocaleString()} limit</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => deleteBudget(budget.id)}>
            <Icon name="delete-outline" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        <View style={styles.budgetProgress}>
          <View style={styles.progressHeader}>
            <Text style={styles.spentText}>${budget.spent.toLocaleString()} spent</Text>
            <Text
              style={[
                styles.remainingText,
                { color: remaining >= 0 ? '#4caf50' : '#f44336' },
              ]}
            >
              ${Math.abs(remaining).toLocaleString()} {remaining >= 0 ? 'left' : 'over'}
            </Text>
          </View>
          <ProgressBar
            progress={Math.min(percentage / 100, 1)}
            color={getProgressColor(percentage)}
            style={styles.progressBar}
          />
          <Text style={styles.percentageText}>{percentage.toFixed(0)}% used</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Budget Tracking</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setEditingBudget(null);
              setCategory('');
              setLimit('');
              setModalVisible(true);
            }}
          >
            <Icon name="plus" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {budgets.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="wallet-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No budgets yet</Text>
            <Text style={styles.emptySubtext}>Create your first budget to start tracking</Text>
          </View>
        ) : (
          budgets.map(renderBudgetCard)
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingBudget ? 'Edit Budget' : 'Create Budget'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Category (e.g., Food, Transport)"
              value={category}
              onChangeText={setCategory}
            />

            <TextInput
              style={styles.input}
              placeholder="Monthly Limit"
              value={limit}
              onChangeText={setLimit}
              keyboardType="numeric"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={saveBudget}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  budgetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  budgetCategory: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  budgetLimit: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  budgetProgress: {
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  spentText: {
    fontSize: 14,
    color: '#666',
  },
  remainingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  percentageText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  saveButton: {
    backgroundColor: '#4caf50',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

