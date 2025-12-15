# NeoBank Mobile App

**Version:** 1.0.0  
**Platform:** iOS & Android  
**Framework:** React Native  
**Author:** Manus AI

---

## Overview

The NeoBank Mobile App is a native mobile application for iOS and Android that provides full access to the NeoBank digital banking platform. Built with React Native, the app offers a seamless mobile banking experience with features including loan management, stock trading, cryptocurrency trading, credit score tracking, and account management.

### Key Features

**Comprehensive Banking** - The mobile app provides complete access to all NeoBank features including loan applications and management, stock and cryptocurrency trading, credit score monitoring, payment processing, and account management.

**Native Performance** - Built with React Native for optimal performance on both iOS and Android devices, the app delivers smooth animations, fast load times, and responsive interactions that feel native to each platform.

**Secure Authentication** - JWT-based authentication with automatic token refresh ensures secure access to your account. The app supports biometric authentication (Face ID, Touch ID, fingerprint) for quick and secure login.

**Offline Support** - Critical data is cached locally using AsyncStorage, allowing you to view your account information even when offline. Changes sync automatically when connection is restored.

**Push Notifications** - Real-time notifications keep you informed about loan payments, transaction updates, market alerts, and account activity.

---

## Technology Stack

### Core Framework

**React Native 0.73** provides the foundation for building native mobile applications using JavaScript and React. The framework enables code sharing between iOS and Android while maintaining native performance and user experience.

### Navigation

**React Navigation 6** handles all navigation patterns including stack navigation for screen transitions, bottom tab navigation for main app sections, and drawer navigation for side menus.

### State Management

**React Query** manages server state with automatic caching, background refetching, and optimistic updates. **React Context** handles global application state including authentication, theme, and notifications.

### Data Persistence

**AsyncStorage** provides asynchronous, persistent, key-value storage for caching user data, authentication tokens, and app preferences.

### UI Components

**React Native Paper** offers Material Design components for consistent UI across platforms. **React Native Vector Icons** provides a comprehensive icon library with Material Icons, FontAwesome, and more.

### API Integration

**Axios** handles HTTP requests with interceptors for authentication, error handling, and request/response transformation.

### Additional Features

**React Native Biometrics** enables fingerprint and face recognition authentication. **React Native Push Notification** handles local and remote push notifications. **React Native Chart Kit** provides beautiful charts for visualizing financial data. **React Native Camera** enables QR code scanning and document capture. **React Native Document Picker** allows file selection for document uploads.

---

## Project Structure

```
neobank-mobile/
├── android/                 # Android native code
├── ios/                     # iOS native code
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── LoadingSpinner.tsx
│   │   ├── TransactionItem.tsx
│   │   └── QuickActionButton.tsx
│   ├── screens/             # Screen components
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── RegisterScreen.tsx
│   │   └── main/
│   │       ├── DashboardScreen.tsx
│   │       ├── LoansScreen.tsx
│   │       ├── TradingScreen.tsx
│   │       ├── CryptoScreen.tsx
│   │       └── ProfileScreen.tsx
│   ├── navigation/          # Navigation configuration
│   │   └── AppNavigator.tsx
│   ├── services/            # API and external services
│   │   ├── ApiService.ts
│   │   ├── BiometricService.ts
│   │   └── NotificationService.ts
│   ├── store/               # State management
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── NotificationContext.tsx
│   ├── utils/               # Utility functions
│   └── assets/              # Images, fonts, etc.
├── package.json
├── tsconfig.json
└── README.md
```

---

## Getting Started

### Prerequisites

Before setting up the mobile app, ensure you have the following installed on your development machine.

**Node.js** version 18.0.0 or higher is required for running React Native and managing dependencies. Download from the official Node.js website or use a version manager like nvm.

**React Native CLI** is needed for building and running the app. Install globally with `npm install -g react-native-cli`.

**Xcode** (macOS only) version 14.0 or higher is required for iOS development. Download from the Mac App Store.

**Android Studio** is required for Android development. Download from the official Android Studio website and install the Android SDK.

**CocoaPods** (macOS only) is needed for managing iOS dependencies. Install with `sudo gem install cocoapods`.

### Installation

Clone the repository and navigate to the mobile app directory.

```bash
git clone https://github.com/your-org/neobank-mobile.git
cd neobank-mobile
```

Install JavaScript dependencies using npm or yarn.

```bash
npm install
# or
yarn install
```

For iOS development, install native dependencies using CocoaPods.

```bash
cd ios
pod install
cd ..
```

### Configuration

Create a `.env` file in the root directory with the following configuration.

```env
API_BASE_URL=https://api.yourdomain.com/api/v1
SENTRY_DSN=your-sentry-dsn
```

For development, you can use localhost for the API.

```env
API_BASE_URL=http://localhost:8000/api/v1
```

### Running the App

**iOS Development** - Start the Metro bundler in one terminal window.

```bash
npm start
```

In another terminal, run the iOS app.

```bash
npm run ios
# or for specific simulator
npm run ios -- --simulator="iPhone 14 Pro"
```

**Android Development** - Ensure you have an Android emulator running or a physical device connected. Start the Metro bundler.

```bash
npm start
```

In another terminal, run the Android app.

```bash
npm run android
```

---

## Features Documentation

### Authentication

The mobile app implements secure authentication using JWT tokens. Users can log in with email and password, use biometric authentication (Face ID, Touch ID, fingerprint), or try the demo account for testing.

When users log in, they receive an access token (valid for thirty minutes) and a refresh token (valid for seven days). The access token is automatically refreshed when it expires, providing a seamless experience without requiring re-authentication.

Biometric authentication can be enabled after the first login. The app securely stores credentials using React Native Keychain and uses biometrics for subsequent logins.

### Dashboard

The dashboard provides a comprehensive overview of the user's financial status. The balance card displays the current account balance with quick action buttons for sending and receiving money. Quick stats show active loans, credit score, and portfolio value with navigation to detailed views.

Quick actions provide one-tap access to common tasks including applying for loans, trading stocks, buying cryptocurrency, and checking credit score. Recent activity displays the latest transactions with type, amount, and date information.

### Loan Management

The loans screen displays all user loans with filtering by status (active, pending, completed). Summary cards show total loans, active loans, and outstanding balance. The next payment card highlights the upcoming payment amount and due date with a quick pay button.

Each loan card displays comprehensive information including loan type, amount, outstanding balance, interest rate, monthly payment, disbursement date, and maturity date. A progress bar visualizes the repayment progress.

Users can tap any loan to view detailed information including complete payment schedule, payment history, and loan documents. The loan application screen guides users through a multi-step process to apply for new loans.

### Trading Features

The trading screen provides access to stock and cryptocurrency markets. Users can view real-time prices, search for stocks and cryptocurrencies, execute buy and sell orders, and track their portfolio performance.

The stock trading interface displays market status for four major exchanges (NSE, NASDAQ, NYSE, LSE), real-time stock quotes with price charts, and portfolio holdings with gain/loss calculations. Users can add stocks to their watchlist for quick access.

Cryptocurrency trading offers similar functionality for digital assets. Users can trade popular cryptocurrencies like Bitcoin, Ethereum, and others, with real-time price updates and portfolio tracking.

### Credit Score

The credit score screen displays the user's current credit score with a visual grade indicator (Excellent, Good, Fair, Poor). Historical score trends are shown in an interactive chart, allowing users to track their progress over time.

Detailed factors affecting the credit score are displayed with explanations and impact levels. Personalized recommendations provide actionable advice for improving the credit score. A loan eligibility calculator estimates approval chances based on the current score.

### Profile Management

The profile screen allows users to view and update their personal information including name, email, phone number, address, and business information. Users can change their password, enable biometric authentication, and manage notification preferences.

The settings section provides options for theme selection (light/dark mode), language preferences, security settings, and privacy controls. Users can view app version information and access help and support resources.

---

## API Integration

The mobile app connects to the same backend API as the web platform, ensuring consistency across all platforms. All API requests include authentication tokens and are automatically retried on failure.

### API Service

The ApiService class provides a centralized interface for all API calls. It handles authentication token injection, automatic token refresh on 401 errors, request/response logging, and error handling with user-friendly messages.

### Offline Support

Critical data is cached locally using AsyncStorage. When the app is offline, users can still view their cached data including account balance, loan information, portfolio holdings, and recent transactions. Changes made offline are queued and synced when connection is restored.

### Error Handling

The app implements comprehensive error handling for network errors, authentication failures, validation errors, and server errors. User-friendly error messages are displayed with retry options when appropriate.

---

## Push Notifications

The app supports both local and remote push notifications for important events.

### Notification Types

**Loan Notifications** alert users about upcoming payments, payment confirmations, and loan status updates. **Transaction Notifications** notify users of deposits, withdrawals, and transfers. **Market Alerts** inform users about significant price changes in their watchlist. **Account Notifications** provide security alerts and account updates.

### Configuration

Push notifications are configured using React Native Push Notification. Users can customize notification preferences in the app settings, choosing which types of notifications to receive and setting quiet hours.

---

## Security

The mobile app implements multiple layers of security to protect user data and prevent unauthorized access.

### Secure Storage

Sensitive data including authentication tokens and user credentials are stored securely using React Native Keychain. This provides encrypted storage with hardware-backed security on supported devices.

### Biometric Authentication

The app supports Face ID, Touch ID, and fingerprint authentication for quick and secure login. Biometric data never leaves the device and is managed by the operating system's secure enclave.

### Network Security

All API requests use HTTPS with certificate pinning to prevent man-in-the-middle attacks. Request and response data is encrypted in transit using TLS 1.2 or higher.

### Session Management

User sessions automatically expire after periods of inactivity. The app requires re-authentication after thirty minutes of inactivity or when the app is backgrounded for extended periods.

---

## Building for Production

### iOS Production Build

Generate a production build for iOS using Xcode or the command line.

```bash
cd ios
xcodebuild -workspace NeobankMobile.xcworkspace \
  -scheme NeobankMobile \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath NeobankMobile.xcarchive \
  archive
```

Create an IPA file for App Store submission.

```bash
xcodebuild -exportArchive \
  -archivePath NeobankMobile.xcarchive \
  -exportPath ./build \
  -exportOptionsPlist ExportOptions.plist
```

### Android Production Build

Generate a signed APK for Android.

```bash
cd android
./gradlew assembleRelease
```

The signed APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.

For Google Play Store submission, generate an AAB (Android App Bundle).

```bash
./gradlew bundleRelease
```

---

## Testing

The mobile app includes comprehensive testing for components, screens, and API integration.

### Running Tests

Execute the test suite using Jest.

```bash
npm test
```

For test coverage reports, run:

```bash
npm test -- --coverage
```

### Test Categories

**Unit Tests** cover individual components and utility functions. **Integration Tests** verify API service functionality and authentication flows. **E2E Tests** test complete user flows from login to transaction completion.

---

## Troubleshooting

### Common Issues

**Metro Bundler Won't Start** - Clear the Metro cache with `npm start -- --reset-cache` and try again.

**iOS Build Fails** - Clean the build folder in Xcode (Product → Clean Build Folder) and reinstall pods with `cd ios && pod install`.

**Android Build Fails** - Clean the Gradle cache with `cd android && ./gradlew clean` and rebuild.

**App Crashes on Launch** - Check the logs using `npx react-native log-ios` or `npx react-native log-android` to identify the error.

---

## Contributing

Contributions to the NeoBank Mobile App are welcome. Please follow the existing code style and include tests for new functionality.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## Support

For questions, issues, or feature requests, please open an issue on the GitHub repository or contact the development team at support@neobank.com.

---

**NeoBank Mobile - Banking at Your Fingertips**

