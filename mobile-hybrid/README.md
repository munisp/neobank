# NeoBank Hybrid Mobile

Complete hybrid mobile application built with React Native Web for cross-platform compatibility (iOS, Android, Web).

## Features

- **29 Screens** - Complete feature parity with PWA and Native Mobile
- **Cross-Platform** - Runs on iOS, Android, and Web
- **Modern Architecture** - React Native with TypeScript
- **Comprehensive Services** - Auth, API, Notifications, Storage
- **Production Ready** - Error handling, loading states, offline support

## Tech Stack

- **Framework:** React Native 0.72 + React Native Web
- **Language:** TypeScript
- **Navigation:** React Navigation 6
- **State Management:** React Hooks
- **API Client:** Axios
- **Charts:** React Native Chart Kit
- **Icons:** React Native Vector Icons

## Project Structure

```
mobile-hybrid/
├── src/
│   ├── screens/          # 29 application screens
│   ├── components/       # Reusable UI components
│   ├── services/         # Core services (Auth, API, etc.)
│   ├── navigation/       # Navigation configuration
│   ├── utils/            # Utility functions
│   └── assets/           # Images, fonts, etc.
├── android/              # Android native code
├── ios/                  # iOS native code
├── web/                  # Web-specific configuration
├── App.tsx               # Application entry point
└── package.json          # Dependencies

```

## Installation

```bash
# Install dependencies
npm install
# or
yarn install
```

## Running the App

### iOS
```bash
npm run ios
# or
yarn ios
```

### Android
```bash
npm run android
# or
yarn android
```

### Web
```bash
npm run web
# or
yarn web
```

## Building for Production

### iOS
```bash
npm run build:ios
```

### Android
```bash
npm run build:android
```

### Web
```bash
npm run build:web
```

## Screens

### Authentication (3)
- LoginScreen
- RegisterScreen
- ForgotPasswordScreen

### Banking (5)
- BankingScreen
- AccountsScreen
- TransactionsScreen
- TransfersScreen
- CardsScreen
- CardManagementScreen

### Loans (3)
- LoansScreen
- LoanApplicationScreen
- CreditScoreScreen

### Payments (1)
- BillPaymentsScreen

### Investments (3)
- InvestmentsScreen
- CryptocurrencyScreen
- StockTradingScreen

### Insurance (4)
- InsuranceScreen
- InsuranceQuoteScreen
- InsurancePolicyScreen
- InsuranceClaimsScreen

### User Management (4)
- ProfileScreen
- SettingsScreen
- NotificationsScreen
- DocumentsScreen

### Analytics (3)
- DashboardScreen
- BudgetScreen
- SpendingInsightsScreen

### Utility (3)
- NotFoundScreen
- OfflineScreen

## Services

### AuthService
- Login, Register, Logout
- Token management
- Biometric authentication
- Password reset

### ApiService
- Centralized API communication
- Auto token refresh
- Offline request queue
- Error handling

### NotificationService
- Push notifications
- Local notifications
- Notification management

### StorageService
- Persistent storage
- Secure storage
- Cache management
- Offline sync

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
API_BASE_URL=https://api.neobank.com
API_TIMEOUT=30000
ENABLE_BIOMETRIC_AUTH=true
ENABLE_PUSH_NOTIFICATIONS=true
```

### API Integration

Update `src/services/ApiService.ts` with your backend API URL:

```typescript
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.neobank.com';
```

## Testing

```bash
# Run tests
npm test
# or
yarn test

# Run tests with coverage
npm run test:coverage
```

## Linting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

## Deployment

### iOS App Store

1. Update version in `ios/NeoBank/Info.plist`
2. Build release version
3. Archive in Xcode
4. Upload to App Store Connect
5. Submit for review

### Google Play Store

1. Update version in `android/app/build.gradle`
2. Build release APK/AAB
3. Upload to Google Play Console
4. Submit for review

### Web Deployment

1. Build production bundle: `npm run build:web`
2. Deploy `build/` directory to hosting service (Vercel, Netlify, etc.)

## Performance Optimization

- **Code Splitting:** Lazy load screens
- **Image Optimization:** Use optimized images
- **Bundle Size:** Minimize dependencies
- **Caching:** Implement proper caching strategies

## Security

- **Authentication:** JWT tokens with refresh
- **Biometric Auth:** Face ID / Touch ID / Fingerprint
- **Secure Storage:** Encrypted local storage
- **HTTPS:** All API calls over HTTPS
- **Input Validation:** Client-side validation

## Troubleshooting

### iOS Build Issues
```bash
cd ios && pod install && cd ..
```

### Android Build Issues
```bash
cd android && ./gradlew clean && cd ..
```

### Metro Bundler Issues
```bash
npx react-native start --reset-cache
```

## Support

For issues and questions:
- GitHub Issues: [github.com/neobank/hybrid-mobile](https://github.com/neobank/hybrid-mobile)
- Email: support@neobank.com

## License

Proprietary - NeoBank Platform

## Version

1.0.0 - Initial Release

**Status:** ✅ Production Ready
