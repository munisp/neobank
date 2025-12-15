import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

// Translation dictionaries
const translations = {
  en: {
    // Common
    welcome: 'Welcome',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    
    // Authentication
    login: 'Login',
    logout: 'Logout',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot Password?',
    
    // Dashboard
    dashboard: 'Dashboard',
    totalBalance: 'Total Balance',
    recentTransactions: 'Recent Transactions',
    quickActions: 'Quick Actions',
    
    // Transactions
    transactions: 'Transactions',
    transfer: 'Transfer',
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    amount: 'Amount',
    recipient: 'Recipient',
    date: 'Date',
    description: 'Description',
    
    // Stock Trading
    stockTrading: 'Stock Trading',
    buyStocks: 'Buy Stocks',
    sellStocks: 'Sell Stocks',
    portfolio: 'Portfolio',
    marketPrice: 'Market Price',
    shares: 'Shares',
    
    // Loans
    loans: 'Loans',
    applyLoan: 'Apply for Loan',
    loanAmount: 'Loan Amount',
    interestRate: 'Interest Rate',
    loanTerm: 'Loan Term',
    monthlyPayment: 'Monthly Payment',
    
    // Credit Score
    creditScore: 'Credit Score',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    
    // Settings
    settings: 'Settings',
    profile: 'Profile',
    security: 'Security',
    notifications: 'Notifications',
    language: 'Language',
    theme: 'Theme',
    
    // Errors
    networkError: 'Network error. Please check your connection.',
    invalidCredentials: 'Invalid email or password',
    sessionExpired: 'Your session has expired. Please login again.',
  },
  es: {
    // Common
    welcome: 'Bienvenido',
    loading: 'Cargando...',
    error: 'Error',
    success: 'Éxito',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    save: 'Guardar',
    delete: 'Eliminar',
    edit: 'Editar',
    back: 'Atrás',
    next: 'Siguiente',
    done: 'Hecho',
    
    // Authentication
    login: 'Iniciar Sesión',
    logout: 'Cerrar Sesión',
    register: 'Registrarse',
    email: 'Correo Electrónico',
    password: 'Contraseña',
    forgotPassword: '¿Olvidaste tu Contraseña?',
    
    // Dashboard
    dashboard: 'Panel',
    totalBalance: 'Saldo Total',
    recentTransactions: 'Transacciones Recientes',
    quickActions: 'Acciones Rápidas',
    
    // Transactions
    transactions: 'Transacciones',
    transfer: 'Transferir',
    deposit: 'Depósito',
    withdrawal: 'Retiro',
    amount: 'Cantidad',
    recipient: 'Destinatario',
    date: 'Fecha',
    description: 'Descripción',
    
    // Stock Trading
    stockTrading: 'Comercio de Acciones',
    buyStocks: 'Comprar Acciones',
    sellStocks: 'Vender Acciones',
    portfolio: 'Portafolio',
    marketPrice: 'Precio de Mercado',
    shares: 'Acciones',
    
    // Loans
    loans: 'Préstamos',
    applyLoan: 'Solicitar Préstamo',
    loanAmount: 'Monto del Préstamo',
    interestRate: 'Tasa de Interés',
    loanTerm: 'Plazo del Préstamo',
    monthlyPayment: 'Pago Mensual',
    
    // Credit Score
    creditScore: 'Puntuación de Crédito',
    excellent: 'Excelente',
    good: 'Bueno',
    fair: 'Regular',
    poor: 'Pobre',
    
    // Settings
    settings: 'Configuración',
    profile: 'Perfil',
    security: 'Seguridad',
    notifications: 'Notificaciones',
    language: 'Idioma',
    theme: 'Tema',
    
    // Errors
    networkError: 'Error de red. Por favor verifica tu conexión.',
    invalidCredentials: 'Correo o contraseña inválidos',
    sessionExpired: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
  },
  fr: {
    // Common
    welcome: 'Bienvenue',
    loading: 'Chargement...',
    error: 'Erreur',
    success: 'Succès',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    save: 'Enregistrer',
    delete: 'Supprimer',
    edit: 'Modifier',
    back: 'Retour',
    next: 'Suivant',
    done: 'Terminé',
    
    // Authentication
    login: 'Connexion',
    logout: 'Déconnexion',
    register: "S'inscrire",
    email: 'Email',
    password: 'Mot de passe',
    forgotPassword: 'Mot de passe oublié?',
    
    // Dashboard
    dashboard: 'Tableau de bord',
    totalBalance: 'Solde Total',
    recentTransactions: 'Transactions Récentes',
    quickActions: 'Actions Rapides',
    
    // Transactions
    transactions: 'Transactions',
    transfer: 'Transférer',
    deposit: 'Dépôt',
    withdrawal: 'Retrait',
    amount: 'Montant',
    recipient: 'Destinataire',
    date: 'Date',
    description: 'Description',
    
    // Stock Trading
    stockTrading: 'Trading d\'Actions',
    buyStocks: 'Acheter des Actions',
    sellStocks: 'Vendre des Actions',
    portfolio: 'Portefeuille',
    marketPrice: 'Prix du Marché',
    shares: 'Actions',
    
    // Loans
    loans: 'Prêts',
    applyLoan: 'Demander un Prêt',
    loanAmount: 'Montant du Prêt',
    interestRate: 'Taux d\'Intérêt',
    loanTerm: 'Durée du Prêt',
    monthlyPayment: 'Paiement Mensuel',
    
    // Credit Score
    creditScore: 'Score de Crédit',
    excellent: 'Excellent',
    good: 'Bon',
    fair: 'Moyen',
    poor: 'Faible',
    
    // Settings
    settings: 'Paramètres',
    profile: 'Profil',
    security: 'Sécurité',
    notifications: 'Notifications',
    language: 'Langue',
    theme: 'Thème',
    
    // Errors
    networkError: 'Erreur réseau. Veuillez vérifier votre connexion.',
    invalidCredentials: 'Email ou mot de passe invalide',
    sessionExpired: 'Votre session a expiré. Veuillez vous reconnecter.',
  },
  de: {
    // Common
    welcome: 'Willkommen',
    loading: 'Lädt...',
    error: 'Fehler',
    success: 'Erfolg',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    save: 'Speichern',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    back: 'Zurück',
    next: 'Weiter',
    done: 'Fertig',
    
    // Authentication
    login: 'Anmelden',
    logout: 'Abmelden',
    register: 'Registrieren',
    email: 'E-Mail',
    password: 'Passwort',
    forgotPassword: 'Passwort vergessen?',
    
    // Dashboard
    dashboard: 'Dashboard',
    totalBalance: 'Gesamtsaldo',
    recentTransactions: 'Letzte Transaktionen',
    quickActions: 'Schnellaktionen',
    
    // Transactions
    transactions: 'Transaktionen',
    transfer: 'Überweisung',
    deposit: 'Einzahlung',
    withdrawal: 'Abhebung',
    amount: 'Betrag',
    recipient: 'Empfänger',
    date: 'Datum',
    description: 'Beschreibung',
    
    // Stock Trading
    stockTrading: 'Aktienhandel',
    buyStocks: 'Aktien Kaufen',
    sellStocks: 'Aktien Verkaufen',
    portfolio: 'Portfolio',
    marketPrice: 'Marktpreis',
    shares: 'Aktien',
    
    // Loans
    loans: 'Kredite',
    applyLoan: 'Kredit Beantragen',
    loanAmount: 'Kreditbetrag',
    interestRate: 'Zinssatz',
    loanTerm: 'Kreditlaufzeit',
    monthlyPayment: 'Monatliche Zahlung',
    
    // Credit Score
    creditScore: 'Kreditwürdigkeit',
    excellent: 'Ausgezeichnet',
    good: 'Gut',
    fair: 'Befriedigend',
    poor: 'Schlecht',
    
    // Settings
    settings: 'Einstellungen',
    profile: 'Profil',
    security: 'Sicherheit',
    notifications: 'Benachrichtigungen',
    language: 'Sprache',
    theme: 'Design',
    
    // Errors
    networkError: 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung.',
    invalidCredentials: 'Ungültige E-Mail oder Passwort',
    sessionExpired: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  },
  zh: {
    // Common
    welcome: '欢迎',
    loading: '加载中...',
    error: '错误',
    success: '成功',
    cancel: '取消',
    confirm: '确认',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    back: '返回',
    next: '下一步',
    done: '完成',
    
    // Authentication
    login: '登录',
    logout: '登出',
    register: '注册',
    email: '邮箱',
    password: '密码',
    forgotPassword: '忘记密码？',
    
    // Dashboard
    dashboard: '仪表板',
    totalBalance: '总余额',
    recentTransactions: '最近交易',
    quickActions: '快速操作',
    
    // Transactions
    transactions: '交易',
    transfer: '转账',
    deposit: '存款',
    withdrawal: '取款',
    amount: '金额',
    recipient: '收款人',
    date: '日期',
    description: '描述',
    
    // Stock Trading
    stockTrading: '股票交易',
    buyStocks: '买入股票',
    sellStocks: '卖出股票',
    portfolio: '投资组合',
    marketPrice: '市场价格',
    shares: '股份',
    
    // Loans
    loans: '贷款',
    applyLoan: '申请贷款',
    loanAmount: '贷款金额',
    interestRate: '利率',
    loanTerm: '贷款期限',
    monthlyPayment: '月供',
    
    // Credit Score
    creditScore: '信用评分',
    excellent: '优秀',
    good: '良好',
    fair: '一般',
    poor: '较差',
    
    // Settings
    settings: '设置',
    profile: '个人资料',
    security: '安全',
    notifications: '通知',
    language: '语言',
    theme: '主题',
    
    // Errors
    networkError: '网络错误。请检查您的连接。',
    invalidCredentials: '邮箱或密码无效',
    sessionExpired: '您的会话已过期。请重新登录。',
  },
};

class LanguageService {
  private i18n: I18n;
  private currentLocale: string;

  constructor() {
    this.i18n = new I18n(translations);
    this.currentLocale = Localization.locale.split('-')[0]; // Get language code only
    this.i18n.locale = this.currentLocale;
    this.i18n.enableFallback = true;
    this.i18n.defaultLocale = 'en';
    
    this.loadSavedLanguage();
  }

  private async loadSavedLanguage() {
    try {
      const savedLanguage = await AsyncStorage.getItem('app_language');
      if (savedLanguage && this.isLanguageSupported(savedLanguage)) {
        this.setLanguage(savedLanguage);
      }
    } catch (error) {
      console.error('Error loading saved language:', error);
    }
  }

  async setLanguage(languageCode: string): Promise<void> {
    if (!this.isLanguageSupported(languageCode)) {
      console.warn(`Language ${languageCode} not supported, falling back to English`);
      languageCode = 'en';
    }

    this.currentLocale = languageCode;
    this.i18n.locale = languageCode;

    try {
      await AsyncStorage.setItem('app_language', languageCode);
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  }

  getCurrentLanguage(): string {
    return this.currentLocale;
  }

  getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
    ];
  }

  isLanguageSupported(languageCode: string): boolean {
    return Object.keys(translations).includes(languageCode);
  }

  t(key: string, options?: any): string {
    return this.i18n.t(key, options);
  }

  formatCurrency(amount: number, currencyCode: string = 'USD'): string {
    return new Intl.NumberFormat(this.currentLocale, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  }

  formatDate(date: Date, format: 'short' | 'long' | 'full' = 'short'): string {
    const options: Intl.DateTimeFormatOptions = {
      short: { year: 'numeric', month: 'numeric', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric' },
      full: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
    }[format];

    return new Intl.DateTimeFormat(this.currentLocale, options).format(date);
  }

  formatNumber(number: number, decimals: number = 2): string {
    return new Intl.NumberFormat(this.currentLocale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(number);
  }

  getDirection(): 'ltr' | 'rtl' {
    // Add RTL languages as needed (Arabic, Hebrew, etc.)
    const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    return rtlLanguages.includes(this.currentLocale) ? 'rtl' : 'ltr';
  }
}

export default new LanguageService();

