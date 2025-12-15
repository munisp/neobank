import Voice from '@react-native-voice/voice';
import * as Speech from 'expo-speech';
import ApiService from './ApiService';
import { Linking } from 'react-native';

export interface VoiceCommand {
  intent: string;
  entities: { [key: string]: any };
  confidence: number;
  rawText: string;
}

export interface VoiceResponse {
  text: string;
  data?: any;
  action?: string;
  speak: boolean;
}

class VoiceAssistantService {
  private isListening: boolean = false;
  private recognizedText: string = '';
  private conversationHistory: { role: 'user' | 'assistant'; text: string }[] = [];

  constructor() {
    this.initialize();
  }

  private async initialize() {
    Voice.onSpeechStart = this.onSpeechStart.bind(this);
    Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
    Voice.onSpeechResults = this.onSpeechResults.bind(this);
    Voice.onSpeechError = this.onSpeechError.bind(this);
  }

  private onSpeechStart() {
    this.isListening = true;
    console.log('Voice recognition started');
  }

  private onSpeechEnd() {
    this.isListening = false;
    console.log('Voice recognition ended');
  }

  private onSpeechResults(event: any) {
    if (event.value && event.value.length > 0) {
      this.recognizedText = event.value[0];
      console.log('Recognized:', this.recognizedText);
    }
  }

  private onSpeechError(event: any) {
    console.error('Voice recognition error:', event.error);
    this.isListening = false;
  }

  async startListening(): Promise<void> {
    try {
      await Voice.start('en-US');
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      throw error;
    }
  }

  async stopListening(): Promise<string> {
    try {
      await Voice.stop();
      return this.recognizedText;
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
      throw error;
    }
  }

  async processVoiceCommand(text: string): Promise<VoiceResponse> {
    const command = this.parseCommand(text);
    this.conversationHistory.push({ role: 'user', text });

    let response: VoiceResponse;

    switch (command.intent) {
      case 'check_balance':
        response = await this.handleCheckBalance(command);
        break;
      case 'send_money':
        response = await this.handleSendMoney(command);
        break;
      case 'show_spending':
        response = await this.handleShowSpending(command);
        break;
      case 'buy_stock':
        response = await this.handleBuyStock(command);
        break;
      case 'pay_bill':
        response = await this.handlePayBill(command);
        break;
      case 'show_transactions':
        response = await this.handleShowTransactions(command);
        break;
      case 'transfer':
        response = await this.handleTransfer(command);
        break;
      case 'check_credit_score':
        response = await this.handleCheckCreditScore(command);
        break;
      case 'find_atm':
        response = await this.handleFindATM(command);
        break;
      case 'block_card':
        response = await this.handleBlockCard(command);
        break;
      default:
        response = await this.handleUnknownCommand(text);
    }

    this.conversationHistory.push({ role: 'assistant', text: response.text });

    if (response.speak) {
      await this.speak(response.text);
    }

    return response;
  }

  private parseCommand(text: string): VoiceCommand {
    const lowerText = text.toLowerCase();
    let intent = 'unknown';
    let entities: { [key: string]: any } = {};
    let confidence = 0.8;

    // Check balance
    if (lowerText.includes('balance') || lowerText.includes('how much')) {
      intent = 'check_balance';
      if (lowerText.includes('checking')) entities.account = 'checking';
      if (lowerText.includes('savings')) entities.account = 'savings';
    }
    // Send money
    else if (lowerText.includes('send') || lowerText.includes('transfer to')) {
      intent = 'send_money';
      const amountMatch = lowerText.match(/(\d+(?:\.\d{2})?)\s*(?:dollars?|bucks?)?/);
      if (amountMatch) entities.amount = parseFloat(amountMatch[1]);
      const nameMatch = lowerText.match(/to\s+([a-z]+)/i);
      if (nameMatch) entities.recipient = nameMatch[1];
    }
    // Show spending
    else if (lowerText.includes('spending') || lowerText.includes('spent')) {
      intent = 'show_spending';
      if (lowerText.includes('this month') || lowerText.includes('month')) entities.period = 'month';
      if (lowerText.includes('this week') || lowerText.includes('week')) entities.period = 'week';
      if (lowerText.includes('today')) entities.period = 'today';
    }
    // Buy stock
    else if (lowerText.includes('buy') && (lowerText.includes('stock') || lowerText.includes('share'))) {
      intent = 'buy_stock';
      const sharesMatch = lowerText.match(/(\d+)\s*shares?/);
      if (sharesMatch) entities.shares = parseInt(sharesMatch[1]);
      const symbolMatch = lowerText.match(/(?:of|stock)\s+([a-z]+)/i);
      if (symbolMatch) entities.symbol = symbolMatch[1].toUpperCase();
    }
    // Pay bill
    else if (lowerText.includes('pay') && lowerText.includes('bill')) {
      intent = 'pay_bill';
      if (lowerText.includes('electricity')) entities.billType = 'electricity';
      if (lowerText.includes('water')) entities.billType = 'water';
      if (lowerText.includes('internet')) entities.billType = 'internet';
      if (lowerText.includes('phone')) entities.billType = 'phone';
    }
    // Show transactions
    else if (lowerText.includes('transaction') || lowerText.includes('recent')) {
      intent = 'show_transactions';
      const limitMatch = lowerText.match(/(\d+)\s*(?:last|recent)?/);
      if (limitMatch) entities.limit = parseInt(limitMatch[1]);
    }
    // Transfer between accounts
    else if (lowerText.includes('transfer') && lowerText.includes('from')) {
      intent = 'transfer';
      const amountMatch = lowerText.match(/(\d+(?:\.\d{2})?)/);
      if (amountMatch) entities.amount = parseFloat(amountMatch[1]);
      if (lowerText.includes('checking')) entities.from = 'checking';
      if (lowerText.includes('savings')) entities.to = 'savings';
    }
    // Check credit score
    else if (lowerText.includes('credit score')) {
      intent = 'check_credit_score';
    }
    // Find ATM
    else if (lowerText.includes('atm') || lowerText.includes('nearest')) {
      intent = 'find_atm';
    }
    // Block card
    else if (lowerText.includes('block') || lowerText.includes('freeze')) {
      intent = 'block_card';
    }

    return { intent, entities, confidence, rawText: text };
  }

  private async handleCheckBalance(command: VoiceCommand): Promise<VoiceResponse> {
    try {
      const account = command.entities.account || 'checking';
      const response = await ApiService.get(`/accounts/${account}/balance`);
      const balance = response.data.balance;

      return {
        text: `Your ${account} account balance is $${balance.toFixed(2)}`,
        data: { balance, account },
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not retrieve your balance at this time.',
        speak: true,
      };
    }
  }

  private async handleSendMoney(command: VoiceCommand): Promise<VoiceResponse> {
    const { amount, recipient } = command.entities;

    if (!amount || !recipient) {
      return {
        text: 'Please specify both the amount and recipient. For example, "Send 50 dollars to John"',
        speak: true,
      };
    }

    try {
      await ApiService.post('/transactions/send', { amount, recipient });
      return {
        text: `I've sent $${amount.toFixed(2)} to ${recipient}`,
        data: { amount, recipient },
        action: 'transaction_completed',
        speak: true,
      };
    } catch (error) {
      return {
        text: `Sorry, I couldn't send money to ${recipient}. Please check your balance and try again.`,
        speak: true,
      };
    }
  }

  private async handleShowSpending(command: VoiceCommand): Promise<VoiceResponse> {
    const period = command.entities.period || 'month';

    try {
      const response = await ApiService.get(`/spending/${period}`);
      const total = response.data.total;
      const topCategory = response.data.categories[0];

      return {
        text: `You've spent $${total.toFixed(2)} ${period === 'month' ? 'this month' : period === 'week' ? 'this week' : 'today'}. Your top spending category is ${topCategory.name} at $${topCategory.amount.toFixed(2)}`,
        data: response.data,
        action: 'show_spending_details',
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not retrieve your spending information.',
        speak: true,
      };
    }
  }

  private async handleBuyStock(command: VoiceCommand): Promise<VoiceResponse> {
    const { shares, symbol } = command.entities;

    if (!shares || !symbol) {
      return {
        text: 'Please specify both the number of shares and stock symbol. For example, "Buy 10 shares of Apple"',
        speak: true,
      };
    }

    try {
      const response = await ApiService.post('/stocks/buy', { shares, symbol });
      const price = response.data.price;
      const total = shares * price;

      return {
        text: `I've purchased ${shares} shares of ${symbol} at $${price.toFixed(2)} per share, for a total of $${total.toFixed(2)}`,
        data: { shares, symbol, price, total },
        action: 'stock_purchased',
        speak: true,
      };
    } catch (error) {
      return {
        text: `Sorry, I couldn't complete the stock purchase. Please check your account and try again.`,
        speak: true,
      };
    }
  }

  private async handlePayBill(command: VoiceCommand): Promise<VoiceResponse> {
    const billType = command.entities.billType;

    if (!billType) {
      return {
        text: 'Which bill would you like to pay? For example, "Pay my electricity bill"',
        speak: true,
      };
    }

    try {
      const response = await ApiService.post('/bills/pay', { billType });
      const amount = response.data.amount;

      return {
        text: `I've paid your ${billType} bill of $${amount.toFixed(2)}`,
        data: { billType, amount },
        action: 'bill_paid',
        speak: true,
      };
    } catch (error) {
      return {
        text: `Sorry, I couldn't pay your ${billType} bill. Please try again later.`,
        speak: true,
      };
    }
  }

  private async handleShowTransactions(command: VoiceCommand): Promise<VoiceResponse> {
    const limit = command.entities.limit || 5;

    try {
      const response = await ApiService.get(`/transactions/recent?limit=${limit}`);
      const transactions = response.data.transactions;
      const latest = transactions[0];

      return {
        text: `Your most recent transaction was ${latest.description} for $${Math.abs(latest.amount).toFixed(2)} on ${new Date(latest.date).toLocaleDateString()}`,
        data: { transactions },
        action: 'show_transactions',
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not retrieve your transactions.',
        speak: true,
      };
    }
  }

  private async handleTransfer(command: VoiceCommand): Promise<VoiceResponse> {
    const { amount, from, to } = command.entities;

    if (!amount || !from || !to) {
      return {
        text: 'Please specify the amount and accounts. For example, "Transfer 100 dollars from checking to savings"',
        speak: true,
      };
    }

    try {
      await ApiService.post('/accounts/transfer', { amount, from, to });
      return {
        text: `I've transferred $${amount.toFixed(2)} from your ${from} to your ${to} account`,
        data: { amount, from, to },
        action: 'transfer_completed',
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not complete the transfer. Please check your balance and try again.',
        speak: true,
      };
    }
  }

  private async handleCheckCreditScore(command: VoiceCommand): Promise<VoiceResponse> {
    try {
      const response = await ApiService.get('/credit-score');
      const score = response.data.score;
      const change = response.data.change;

      return {
        text: `Your credit score is ${score}${change > 0 ? `, up ${change} points` : change < 0 ? `, down ${Math.abs(change)} points` : ''}`,
        data: { score, change },
        action: 'show_credit_score',
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not retrieve your credit score.',
        speak: true,
      };
    }
  }

  private async handleFindATM(command: VoiceCommand): Promise<VoiceResponse> {
    try {
      const response = await ApiService.get('/atms/nearby');
      const nearest = response.data.atms[0];

      return {
        text: `The nearest ATM is ${nearest.distance} miles away at ${nearest.address}`,
        data: { atms: response.data.atms },
        action: 'show_atm_map',
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not find nearby ATMs.',
        speak: true,
      };
    }
  }

  private async handleBlockCard(command: VoiceCommand): Promise<VoiceResponse> {
    try {
      await ApiService.post('/cards/block');
      return {
        text: 'I\'ve blocked your card. You can unblock it anytime from the app.',
        action: 'card_blocked',
        speak: true,
      };
    } catch (error) {
      return {
        text: 'Sorry, I could not block your card. Please try again.',
        speak: true,
      };
    }
  }

  private async handleUnknownCommand(text: string): Promise<VoiceResponse> {
    return {
      text: 'I\'m sorry, I didn\'t understand that. You can ask me about your balance, send money, check spending, buy stocks, or pay bills.',
      speak: true,
    };
  }

  private async speak(text: string): Promise<void> {
    try {
      await Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.9,
      });
    } catch (error) {
      console.error('Error speaking:', error);
    }
  }

  async registerSiriShortcut(phrase: string, action: string): Promise<void> {
    // iOS Siri Shortcuts integration
    if (Linking.canOpenURL('shortcuts://')) {
      const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(phrase)}&input=${encodeURIComponent(action)}`;
      await Linking.openURL(shortcutUrl);
    }
  }

  async registerGoogleAssistantAction(phrase: string, action: string): Promise<void> {
    // Google Assistant integration would be handled via Google Actions Console
    console.log(`Registered Google Assistant action: ${phrase} -> ${action}`);
  }

  getConversationHistory(): { role: 'user' | 'assistant'; text: string }[] {
    return this.conversationHistory;
  }

  clearConversationHistory(): void {
    this.conversationHistory = [];
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  async destroy(): Promise<void> {
    await Voice.destroy();
  }
}

export default new VoiceAssistantService();

