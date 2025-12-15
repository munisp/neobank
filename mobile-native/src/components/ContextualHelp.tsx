import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface HelpContent {
  title: string;
  description: string;
  steps?: string[];
  tips?: string[];
}

interface ContextualHelpProps {
  context: string;
  position?: { x: number; y: number };
  autoShow?: boolean;
}

const helpDatabase: Record<string, HelpContent> = {
  'dashboard': {
    title: 'Dashboard Overview',
    description: 'Your financial snapshot at a glance',
    steps: [
      'View your total balance across all accounts',
      'Check recent transactions',
      'Access quick actions for common tasks',
      'Monitor spending trends'
    ],
    tips: ['Tap any card to see more details', 'Swipe left for quick actions']
  },
  'stock-trading': {
    title: 'Stock Trading',
    description: 'Buy and sell stocks from major exchanges',
    steps: [
      'Search for a stock by symbol or name',
      'View real-time prices and charts',
      'Enter the number of shares to trade',
      'Review and confirm your order'
    ],
    tips: ['Set price alerts to track stocks', 'Use limit orders to control price']
  },
  'loan-application': {
    title: 'Apply for a Loan',
    description: 'Complete your loan application in minutes',
    steps: [
      'Select loan type and amount',
      'Provide business information',
      'Submit financial details',
      'Review and submit application'
    ],
    tips: ['Have your tax documents ready', 'Higher credit scores get better rates']
  },
  'budget': {
    title: 'Budget Tracking',
    description: 'Set and monitor spending limits',
    steps: [
      'Create a budget for each category',
      'Set monthly spending limits',
      'Track progress in real-time',
      'Get alerts when approaching limits'
    ],
    tips: ['Start with major categories', 'Review and adjust monthly']
  },
  'bills': {
    title: 'Bill Reminders',
    description: 'Never miss a payment',
    steps: [
      'Add your recurring bills',
      'Set reminder preferences',
      'Mark bills as paid',
      'View payment history'
    ],
    tips: ['Enable notifications for reminders', 'Set reminders 3-5 days before due date']
  }
};

export default function ContextualHelp({ context, position, autoShow = false }: ContextualHelpProps) {
  const [visible, setVisible] = useState(autoShow);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  const helpContent = helpDatabase[context] || {
    title: 'Help',
    description: 'No help available for this section',
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const toggleHelp = () => {
    setVisible(!visible);
  };

  return (
    <>
      <TouchableOpacity style={styles.helpButton} onPress={toggleHelp}>
        <Icon name="help-circle-outline" size={24} color="#2196f3" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <Animated.View
            style={[
              styles.helpCard,
              position && { top: position.y, left: position.x },
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Icon name="lightbulb-on-outline" size={24} color="#2196f3" />
              <Text style={styles.title}>{helpContent.title}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.description}>{helpContent.description}</Text>

            {helpContent.steps && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How to use:</Text>
                {helpContent.steps.map((step, index) => (
                  <View key={index} style={styles.step}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {helpContent.tips && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 Tips:</Text>
                {helpContent.tips.map((tip, index) => (
                  <View key={index} style={styles.tip}>
                    <Icon name="check-circle" size={16} color="#4caf50" />
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.gotItButton} onPress={() => setVisible(false)}>
              <Text style={styles.gotItText}>Got it!</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  helpButton: {
    padding: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196f3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    lineHeight: 20,
  },
  gotItButton: {
    backgroundColor: '#2196f3',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  gotItText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

