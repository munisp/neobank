import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import * as Haptics from 'expo-haptics';

export interface VoiceCommand {
  command: string;
  action: string;
  params?: any;
  confidence: number;
}

class VoiceCommandsService {
  private isListening: boolean = false;
  private commandPatterns: Map<RegExp, (matches: RegExpMatchArray) => VoiceCommand>;

  constructor() {
    this.commandPatterns = new Map();
    this.initializeCommands();
    this.setupVoiceListeners();
  }

  private initializeCommands() {
    // Transfer commands
    this.commandPatterns.set(
      /(?:transfer|send)\s+(?:\$)?(\d+(?:\.\d{2})?)\s+(?:to|for)\s+(.+)/i,
      (matches) => ({
        command: 'transfer',
        action: 'navigate',
        params: { screen: 'Transfer', amount: matches[1], recipient: matches[2] },
        confidence: 0.9,
      })
    );

    // Balance check
    this.commandPatterns.set(
      /(?:what(?:'s| is)|show|check)\s+(?:my\s+)?balance/i,
      () => ({
        command: 'check_balance',
        action: 'navigate',
        params: { screen: 'Dashboard' },
        confidence: 0.95,
      })
    );

    // Stock trading
    this.commandPatterns.set(
      /(?:buy|purchase)\s+(\d+)\s+(?:shares?\s+of\s+)?([A-Z]{1,5})/i,
      (matches) => ({
        command: 'buy_stock',
        action: 'navigate',
        params: { screen: 'StockTrading', symbol: matches[2], quantity: matches[1] },
        confidence: 0.85,
      })
    );

    // Pay bill
    this.commandPatterns.set(
      /(?:pay|settle)\s+(?:my\s+)?(.+?)\s+bill/i,
      (matches) => ({
        command: 'pay_bill',
        action: 'navigate',
        params: { screen: 'BillReminders', billName: matches[1] },
        confidence: 0.8,
      })
    );

    // Loan application
    this.commandPatterns.set(
      /(?:apply|request)\s+(?:for\s+)?(?:a\s+)?loan/i,
      () => ({
        command: 'apply_loan',
        action: 'navigate',
        params: { screen: 'LoanApplication' },
        confidence: 0.9,
      })
    );

    // Credit score
    this.commandPatterns.set(
      /(?:show|check|what(?:'s| is))\s+(?:my\s+)?credit\s+score/i,
      () => ({
        command: 'check_credit',
        action: 'navigate',
        params: { screen: 'CreditScore' },
        confidence: 0.95,
      })
    );

    // Recent transactions
    this.commandPatterns.set(
      /(?:show|list|view)\s+(?:my\s+)?(?:recent\s+)?transactions/i,
      () => ({
        command: 'view_transactions',
        action: 'navigate',
        params: { screen: 'Transactions' },
        confidence: 0.9,
      })
    );

    // Cryptocurrency
    this.commandPatterns.set(
      /(?:buy|trade)\s+(.+?)\s+(?:crypto|cryptocurrency)/i,
      (matches) => ({
        command: 'trade_crypto',
        action: 'navigate',
        params: { screen: 'Cryptocurrency', symbol: matches[1] },
        confidence: 0.85,
      })
    );

    // Budget
    this.commandPatterns.set(
      /(?:show|check|view)\s+(?:my\s+)?budget/i,
      () => ({
        command: 'view_budget',
        action: 'navigate',
        params: { screen: 'Budget' },
        confidence: 0.9,
      })
    );

    // Help
    this.commandPatterns.set(
      /(?:help|assist|support)/i,
      () => ({
        command: 'help',
        action: 'navigate',
        params: { screen: 'Help' },
        confidence: 0.95,
      })
    );
  }

  private setupVoiceListeners() {
    Voice.onSpeechStart = this.onSpeechStart.bind(this);
    Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
    Voice.onSpeechResults = this.onSpeechResults.bind(this);
    Voice.onSpeechError = this.onSpeechError.bind(this);
  }

  private onSpeechStart() {
    this.isListening = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  private onSpeechEnd() {
    this.isListening = false;
  }

  private onSpeechResults(event: SpeechResultsEvent) {
    if (event.value && event.value.length > 0) {
      const transcript = event.value[0];
      const command = this.parseCommand(transcript);
      
      if (command && command.confidence > 0.7) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        this.executeCommand(command);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }

  private onSpeechError(event: SpeechErrorEvent) {
    console.error('Voice recognition error:', event.error);
    this.isListening = false;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  private parseCommand(transcript: string): VoiceCommand | null {
    for (const [pattern, commandBuilder] of this.commandPatterns) {
      const matches = transcript.match(pattern);
      if (matches) {
        return commandBuilder(matches);
      }
    }
    return null;
  }

  private executeCommand(command: VoiceCommand) {
    // This will be handled by the component that uses this service
    console.log('Executing command:', command);
  }

  async startListening(): Promise<void> {
    try {
      await Voice.start('en-US');
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    try {
      await Voice.stop();
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
    }
  }

  async cancelListening(): Promise<void> {
    try {
      await Voice.cancel();
    } catch (error) {
      console.error('Error canceling voice recognition:', error);
    }
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  async destroy(): Promise<void> {
    try {
      await Voice.destroy();
      Voice.removeAllListeners();
    } catch (error) {
      console.error('Error destroying voice service:', error);
    }
  }
}

export default new VoiceCommandsService();

