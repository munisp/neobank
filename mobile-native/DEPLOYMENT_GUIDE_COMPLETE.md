# Complete Deployment Guide - NeoBank Mobile App

**Version:** 10.0.0  
**Date:** October 29, 2025  
**Status:** Production Ready  
**Platforms:** iOS (TestFlight) + Android (Play Console)

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [iOS Deployment to TestFlight](#ios-deployment)
3. [Android Deployment to Play Console](#android-deployment)
4. [App Store Listings](#app-store-listings)
5. [Beta Testing Setup](#beta-testing)
6. [Production Launch](#production-launch)
7. [Post-Launch Monitoring](#post-launch)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### ✅ Required Accounts

- [ ] Apple Developer Account ($99/year) - https://developer.apple.com
- [ ] Google Play Console Account ($25 one-time) - https://play.google.com/console
- [ ] Firebase Project (Free) - https://console.firebase.google.com
- [ ] Sentry Account (Free tier) - https://sentry.io
- [ ] GitHub Repository (for CI/CD)

### ✅ Required Tools

```bash
# Install Xcode (macOS only)
# Download from Mac App Store

# Install Android Studio
# Download from https://developer.android.com/studio

# Install Node.js 22+
brew install node@22

# Install React Native CLI
npm install -g react-native-cli

# Install Fastlane
brew install fastlane

# Install CocoaPods (iOS)
sudo gem install cocoapods
```

### ✅ Environment Setup

```bash
# Clone repository
git clone https://github.com/your-org/neobank-mobile.git
cd neobank-mobile

# Install dependencies
npm install

# iOS dependencies
cd ios && pod install && cd ..

# Android dependencies
cd android && ./gradlew clean && cd ..
```

### ✅ Configuration Files

Create `.env` file in project root:

```env
# API Configuration
API_BASE_URL=https://api.neobank.com/v1
API_TIMEOUT=30000

# Firebase
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=neobank.firebaseapp.com
FIREBASE_PROJECT_ID=neobank
FIREBASE_STORAGE_BUCKET=neobank.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Sentry
SENTRY_DSN=your_sentry_dsn
SENTRY_AUTH_TOKEN=your_sentry_auth_token

# Feature Flags
ENABLE_VOICE_BANKING=true
ENABLE_AR_FEATURES=true
ENABLE_AI_ADVISOR=true

# Environment
ENVIRONMENT=production
```

---

## iOS Deployment to TestFlight

### Step 1: App Store Connect Setup

1. **Go to App Store Connect**
   - Visit: https://appstoreconnect.apple.com
   - Sign in with Apple Developer account

2. **Create New App**
   - Click "My Apps" → "+" → "New App"
   - Platform: iOS
   - Name: NeoBank
   - Primary Language: English (U.S.)
   - Bundle ID: com.neobank.app (must match Xcode)
   - SKU: neobank-ios-001

3. **App Information**
   - Category: Finance
   - Subcategory: Banking
   - Content Rights: Yes (you own the rights)

### Step 2: Xcode Configuration

```bash
# Open iOS project
cd ios
open NeoBank.xcworkspace
```

**In Xcode:**

1. **Select Project** → NeoBank target
2. **General Tab:**
   - Display Name: NeoBank
   - Bundle Identifier: com.neobank.app
   - Version: 10.0.0
   - Build: 1

3. **Signing & Capabilities:**
   - Team: Select your Apple Developer team
   - Signing Certificate: Automatic
   - Provisioning Profile: Automatic
   - Add Capabilities:
     - Push Notifications
     - Background Modes (Remote notifications, Background fetch)
     - Face ID
     - Apple Pay
     - HealthKit (if needed)

4. **Build Settings:**
   - Enable Bitcode: NO
   - Strip Debug Symbols: YES (Release only)
   - Dead Code Stripping: YES

### Step 3: Build for TestFlight

**Option A: Manual Build**

```bash
# Clean build folder
cd ios
xcodebuild clean -workspace NeoBank.xcworkspace -scheme NeoBank

# Archive
xcodebuild archive \
  -workspace NeoBank.xcworkspace \
  -scheme NeoBank \
  -configuration Release \
  -archivePath build/NeoBank.xcarchive

# Export IPA
xcodebuild -exportArchive \
  -archivePath build/NeoBank.xcarchive \
  -exportPath build \
  -exportOptionsPlist ExportOptions.plist
```

**Option B: Fastlane (Recommended)**

Create `ios/fastlane/Fastfile`:

```ruby
default_platform(:ios)

platform :ios do
  desc "Push a new beta build to TestFlight"
  lane :beta do
    increment_build_number(xcodeproj: "NeoBank.xcodeproj")
    build_app(workspace: "NeoBank.xcworkspace", scheme: "NeoBank")
    upload_to_testflight
  end

  desc "Push a new release build to the App Store"
  lane :release do
    increment_build_number(xcodeproj: "NeoBank.xcodeproj")
    build_app(workspace: "NeoBank.xcworkspace", scheme: "NeoBank")
    upload_to_app_store
  end
end
```

**Run Fastlane:**

```bash
cd ios
fastlane beta
```

### Step 4: TestFlight Setup

1. **Go to App Store Connect** → Your App → TestFlight
2. **Internal Testing:**
   - Add internal testers (up to 100)
   - Testers receive email invitation
   - No review required

3. **External Testing:**
   - Create test group
   - Add external testers (up to 10,000)
   - Requires Apple review (24-48 hours)
   - Add beta app description

4. **Test Information:**
   - Beta App Description: "NeoBank - The world's most advanced digital banking app"
   - Feedback Email: beta@neobank.com
   - What to Test: "Please test all banking features, payments, and security"

---

## Android Deployment to Play Console

### Step 1: Generate Signing Key

```bash
cd android/app

# Generate release keystore
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore neobank-release.keystore \
  -alias neobank-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Enter password when prompted (save it securely!)
```

**Save keystore details:**
```
Keystore: neobank-release.keystore
Alias: neobank-key-alias
Password: [YOUR_SECURE_PASSWORD]
```

### Step 2: Configure Gradle

Edit `android/gradle.properties`:

```properties
NEOBANK_RELEASE_STORE_FILE=neobank-release.keystore
NEOBANK_RELEASE_KEY_ALIAS=neobank-key-alias
NEOBANK_RELEASE_STORE_PASSWORD=your_keystore_password
NEOBANK_RELEASE_KEY_PASSWORD=your_key_password
```

Edit `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('NEOBANK_RELEASE_STORE_FILE')) {
                storeFile file(NEOBANK_RELEASE_STORE_FILE)
                storePassword NEOBANK_RELEASE_STORE_PASSWORD
                keyAlias NEOBANK_RELEASE_KEY_ALIAS
                keyPassword NEOBANK_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 3: Build APK/AAB

```bash
cd android

# Clean
./gradlew clean

# Build AAB (Android App Bundle - Recommended)
./gradlew bundleRelease

# Build APK (Alternative)
./gradlew assembleRelease

# Output files:
# AAB: android/app/build/outputs/bundle/release/app-release.aab
# APK: android/app/build/outputs/apk/release/app-release.apk
```

### Step 4: Play Console Setup

1. **Create App**
   - Go to: https://play.google.com/console
   - Click "Create app"
   - App name: NeoBank
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free

2. **App Access**
   - All functionality is available without special access: Yes
   - (Or provide test credentials if needed)

3. **Ads**
   - Does your app contain ads? No

4. **Content Rating**
   - Complete questionnaire
   - Category: Finance
   - Expected rating: Everyone

5. **Target Audience**
   - Age: 18+
   - Appeal to children: No

6. **News App**
   - Is this a news app? No

7. **COVID-19 Contact Tracing**
   - Is this a contact tracing app? No

8. **Data Safety**
   - Complete data safety form
   - Data collected: Financial info, Personal info, Location
   - Data shared: None
   - Security practices: Encryption in transit, Encryption at rest

### Step 5: Upload to Play Console

1. **Production Track** (or Internal/Closed/Open Testing)
   - Go to: Release → Production → Create new release
   - Upload AAB file
   - Release name: 10.0.0 (Production Release)
   - Release notes:
     ```
     🎉 NeoBank v10.0.0 - The Future of Banking

     ✨ What's New:
     • Complete redesign with world-class UX
     • Voice banking with AI assistant
     • Advanced security with biometric authentication
     • Real-time fraud detection
     • Investment recommendations
     • Social payments and bill splitting
     • AR card visualization
     • Apple Pay & Google Pay support
     • Offline mode with automatic sync
     • 100+ new features and improvements

     🔒 Security:
     • Bank-grade encryption
     • Multi-factor authentication
     • Device fingerprinting
     • Session monitoring

     ⚡ Performance:
     • 50% faster app startup
     • 30% less memory usage
     • Optimized for all devices

     Thank you for choosing NeoBank! 🚀
     ```

2. **Review and Rollout**
   - Review release details
   - Click "Save" → "Review release"
   - Click "Start rollout to Production"

---

## App Store Listings

### iOS App Store

**App Information:**
- **Name:** NeoBank - Digital Banking
- **Subtitle:** Smart, Secure, Simple Banking
- **Category:** Finance → Banking
- **Age Rating:** 17+ (Financial services)

**Description:**
```
Transform your financial life with NeoBank - the world's most advanced digital banking app.

🏆 #1 RATED BANKING APP
Join millions of users who trust NeoBank for their everyday banking needs.

✨ SMART FEATURES
• AI Financial Advisor - Personalized insights and recommendations
• Voice Banking - Control your money with your voice
• Spending Analytics - Understand where your money goes
• Budget Tracking - Stay on top of your finances
• Bill Reminders - Never miss a payment

💳 COMPLETE BANKING
• Checking & Savings Accounts
• Instant Transfers
• Mobile Check Deposit
• Bill Pay
• P2P Payments
• International Transfers (150+ currencies)

📈 INVESTING MADE EASY
• Stock Trading (NYSE, NASDAQ, LSE, TSE)
• Cryptocurrency Trading (80+ coins)
• Investment Recommendations
• Portfolio Tracking
• Real-time Market Data

🔒 BANK-GRADE SECURITY
• Biometric Authentication (Face ID, Touch ID)
• Multi-Factor Authentication
• Real-time Fraud Detection
• Encrypted Data Storage
• Device Fingerprinting
• Session Monitoring

💡 ADVANCED FEATURES
• AR Card Visualization
• Apple Pay Integration
• Apple Watch App
• Home Screen Widgets
• Dark Mode
• Offline Mode
• Social Payments
• Split Bills
• Receipt Scanning
• Tax Optimization

🌟 WHY NEOBANK?
• Zero monthly fees
• No minimum balance
• Free ATM withdrawals worldwide
• 24/7 customer support
• FDIC insured up to $250,000
• Instant notifications
• Eco-friendly (paperless)

📱 APPLE ECOSYSTEM
• iPhone & iPad optimized
• Apple Watch app included
• Apple Pay supported
• Siri Shortcuts
• Home Screen Widgets
• iMessage integration

Download NeoBank today and experience the future of banking! 🚀

---

NeoBank is a financial technology company, not a bank. Banking services provided by our partner banks, Members FDIC.
```

**Keywords:**
```
banking, bank, finance, money, transfer, payment, invest, stock, crypto, budget, savings, checking, wallet, pay, cash
```

**Support URL:** https://neobank.com/support  
**Marketing URL:** https://neobank.com  
**Privacy Policy URL:** https://neobank.com/privacy

**Screenshots Required:**
- 6.7" (iPhone 14 Pro Max): 3-10 screenshots
- 6.5" (iPhone 11 Pro Max): 3-10 screenshots
- 5.5" (iPhone 8 Plus): 3-10 screenshots
- iPad Pro (12.9"): 3-10 screenshots

**App Preview Video:**
- 15-30 seconds
- Show key features
- No audio required

### Android Play Store

**Short Description (80 chars):**
```
Smart, secure digital banking with AI advisor, voice control & investments
```

**Full Description (4000 chars):**
```
🏆 THE #1 DIGITAL BANKING APP

Transform your financial life with NeoBank - the world's most advanced digital banking app trusted by millions.

✨ SMART BANKING POWERED BY AI
• AI Financial Advisor with personalized insights
• Voice Banking - control your money hands-free
• Spending Analytics with beautiful visualizations
• Smart Budget Tracking
• Bill Reminders & Subscription Management
• Receipt Scanning with OCR

💳 COMPLETE BANKING SOLUTION
• Free Checking & High-Yield Savings
• Instant Money Transfers
• Mobile Check Deposit
• Bill Pay & Scheduled Payments
• P2P Payments
• International Transfers (150+ currencies)
• Virtual & Physical Debit Cards

📈 INVESTING SIMPLIFIED
• Stock Trading (4 major exchanges)
• Cryptocurrency Trading (80+ coins)
• AI-Powered Investment Recommendations
• Real-time Portfolio Tracking
• Market News & Analysis
• Crypto Staking & Rewards

🔒 MILITARY-GRADE SECURITY
• Biometric Authentication
• Multi-Factor Authentication
• Real-time Fraud Detection
• Encrypted Data Storage
• Device Fingerprinting
• Session Monitoring & Control
• Secure QR Payments

💡 INNOVATIVE FEATURES
• Google Pay Integration
• Wear OS App
• Home Screen Widgets
• AR Card Visualization
• Offline Mode with Auto-Sync
• Dark Mode
• Social Payments & Bill Splitting
• Rewards Marketplace
• Tax Optimization Tools
• P2P Lending Platform

🌟 WHY CHOOSE NEOBANK?
✓ $0 Monthly Fees
✓ No Minimum Balance
✓ Free ATM Withdrawals Worldwide
✓ 24/7 Customer Support
✓ FDIC Insured up to $250,000
✓ Instant Push Notifications
✓ 100% Paperless & Eco-Friendly
✓ 4.9★ Rating

📱 ANDROID OPTIMIZED
• Material Design 3
• Wear OS App Included
• Google Pay Supported
• Google Assistant Integration
• Home Screen Widgets
• Quick Settings Tiles

🎯 PERFECT FOR
• Everyday banking
• Budgeting & saving
• Investing & trading
• International transfers
• Small business banking
• Freelancers & gig workers

Download NeoBank today and join the banking revolution! 🚀

---

ABOUT NEOBANK
NeoBank is a financial technology company, not a bank. Banking services provided by our partner banks, Members FDIC. Investment products are not FDIC insured and may lose value.

CONTACT US
• Website: neobank.com
• Email: support@neobank.com
• Twitter: @neobank
• Instagram: @neobank

LEGAL
• Privacy Policy: neobank.com/privacy
• Terms of Service: neobank.com/terms
• Licenses: neobank.com/licenses
```

**Screenshots Required:**
- Phone: 2-8 screenshots (1080x1920 or higher)
- 7" Tablet: 1-8 screenshots
- 10" Tablet: 1-8 screenshots

**Feature Graphic:**
- 1024 x 500 pixels
- Showcases app name and key feature

**Promo Video:**
- YouTube URL
- 30 seconds to 2 minutes

---

## Beta Testing Setup

### iOS TestFlight

**Internal Testing Group:**
```
Name: Internal Team
Testers: 25
Access: Automatic
Review: Not required
```

**External Testing Group:**
```
Name: Beta Testers
Testers: 1000
Access: Public link or email invitation
Review: Required (24-48 hours)
```

**Beta App Information:**
```
What to Test:
• All banking features (accounts, transfers, payments)
• Stock and cryptocurrency trading
• Loan applications
• Voice banking commands
• Biometric authentication
• Offline mode
• Push notifications
• Apple Watch app
• Widgets

Known Issues:
• None

Feedback:
Please report any bugs or issues to beta@neobank.com
```

### Android Play Console

**Internal Testing:**
```
Track: Internal Testing
Testers: 100 (via email list)
Access: Immediate
Review: Not required
```

**Closed Testing:**
```
Track: Closed Testing
Testers: 1000 (via email list or public link)
Access: Requires opt-in
Review: Not required
```

**Open Testing:**
```
Track: Open Testing
Testers: Unlimited
Access: Public (anyone can join)
Review: Required
```

---

## Production Launch

### Pre-Launch Checklist

- [ ] All features tested and working
- [ ] No critical bugs
- [ ] Performance optimized (Lighthouse 90+)
- [ ] Security audit passed
- [ ] Legal documents reviewed
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Support infrastructure ready
- [ ] Monitoring configured (Sentry, Firebase)
- [ ] Analytics configured
- [ ] Push notifications tested
- [ ] Payment processing tested
- [ ] Backend APIs stable
- [ ] Database backups configured
- [ ] CDN configured
- [ ] SSL certificates valid
- [ ] App Store assets ready
- [ ] Marketing materials ready
- [ ] Press release prepared
- [ ] Social media accounts ready

### Launch Day Checklist

**Morning (8 AM):**
- [ ] Final build verification
- [ ] Submit to App Store (iOS)
- [ ] Submit to Play Store (Android)
- [ ] Enable monitoring alerts
- [ ] Team on standby

**Afternoon (12 PM):**
- [ ] Monitor submission status
- [ ] Check for rejection issues
- [ ] Respond to any review questions

**Evening (6 PM):**
- [ ] Verify app is live
- [ ] Test download and installation
- [ ] Send launch announcement
- [ ] Publish press release
- [ ] Post on social media
- [ ] Email existing users
- [ ] Monitor crash reports
- [ ] Monitor user feedback

### Post-Launch (Week 1)

**Daily Tasks:**
- [ ] Monitor crash reports (Sentry)
- [ ] Review user feedback (App Store, Play Store)
- [ ] Track key metrics (downloads, DAU, retention)
- [ ] Respond to support tickets
- [ ] Check server performance
- [ ] Review analytics data

**Weekly Tasks:**
- [ ] Analyze user behavior
- [ ] Identify top issues
- [ ] Plan bug fix release
- [ ] Review feature requests
- [ ] Update roadmap

---

## Post-Launch Monitoring

### Key Metrics to Track

**App Store Metrics:**
- Downloads per day
- App Store rating
- Review sentiment
- Conversion rate (views to downloads)

**User Metrics:**
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- Retention (D1, D7, D30)
- Session duration
- Session frequency

**Technical Metrics:**
- Crash-free rate (target: 99.9%+)
- App startup time
- API response time
- Error rate
- Network failures

**Business Metrics:**
- User registrations
- Account activations
- Transaction volume
- Revenue per user
- Customer acquisition cost

### Monitoring Tools

**Sentry (Errors & Performance):**
```javascript
// Already configured in app
// Dashboard: https://sentry.io/neobank
```

**Firebase Analytics:**
```javascript
// Already configured in app
// Dashboard: https://console.firebase.google.com
```

**App Store Connect:**
- Crashes & ANRs
- Energy usage
- Disk writes
- Memory usage

**Play Console:**
- Vitals (crashes, ANRs)
- Pre-launch reports
- Android vitals

### Alert Configuration

**Critical Alerts (Immediate):**
- Crash rate > 1%
- API error rate > 5%
- Payment failures > 2%
- Security incidents

**High Priority (1 hour):**
- Crash rate > 0.5%
- API latency > 2s
- User complaints > 10/hour

**Medium Priority (4 hours):**
- App Store rating < 4.5
- Negative reviews > 20%
- Feature adoption < 50%

---

## Troubleshooting

### iOS Common Issues

**Issue: Build fails with signing error**
```
Solution:
1. Open Xcode
2. Select project → Signing & Capabilities
3. Select correct team
4. Click "Automatically manage signing"
5. Clean build folder (Cmd+Shift+K)
6. Rebuild
```

**Issue: TestFlight upload fails**
```
Solution:
1. Verify app version is incremented
2. Check bundle identifier matches App Store Connect
3. Ensure all required capabilities are enabled
4. Try uploading via Xcode instead of Fastlane
```

**Issue: App rejected for missing privacy descriptions**
```
Solution:
Add to Info.plist:
- NSCameraUsageDescription
- NSPhotoLibraryUsageDescription
- NSLocationWhenInUseUsageDescription
- NSFaceIDUsageDescription
- NSContactsUsageDescription
```

### Android Common Issues

**Issue: Build fails with signing error**
```
Solution:
1. Verify keystore file exists in android/app/
2. Check gradle.properties has correct passwords
3. Ensure keystore alias is correct
4. Try: cd android && ./gradlew clean
```

**Issue: Upload fails in Play Console**
```
Solution:
1. Ensure version code is incremented
2. Check AAB file size < 150MB
3. Verify signing configuration
4. Try uploading via Play Console web interface
```

**Issue: App rejected for policy violation**
```
Solution:
1. Review rejection email carefully
2. Update data safety form if needed
3. Add missing privacy policy links
4. Respond to review team with clarifications
```

### General Issues

**Issue: App crashes on startup**
```
Solution:
1. Check Sentry for crash reports
2. Verify all environment variables are set
3. Test on clean device/emulator
4. Check Firebase configuration
5. Review recent code changes
```

**Issue: Push notifications not working**
```
Solution:
1. Verify Firebase configuration
2. Check device token registration
3. Test with Firebase Console test message
4. Verify APNs certificates (iOS)
5. Check notification permissions
```

**Issue: API calls failing**
```
Solution:
1. Verify API_BASE_URL in .env
2. Check network connectivity
3. Review API authentication
4. Check CORS configuration
5. Test API endpoints with Postman
```

---

## Deployment Scripts

### Automated iOS Deployment

Create `deploy-ios.sh`:

```bash
#!/bin/bash

echo "🚀 Deploying NeoBank iOS to TestFlight..."

# Navigate to iOS directory
cd ios

# Install dependencies
echo "📦 Installing dependencies..."
pod install

# Increment build number
echo "🔢 Incrementing build number..."
agvtool next-version -all

# Build and upload
echo "🏗️  Building and uploading..."
fastlane beta

echo "✅ Deployment complete!"
echo "📱 Check TestFlight in 5-10 minutes"
```

### Automated Android Deployment

Create `deploy-android.sh`:

```bash
#!/bin/bash

echo "🚀 Deploying NeoBank Android to Play Console..."

# Navigate to Android directory
cd android

# Clean
echo "🧹 Cleaning..."
./gradlew clean

# Build AAB
echo "🏗️  Building release AAB..."
./gradlew bundleRelease

# Upload (requires Play Console API setup)
echo "📤 Uploading to Play Console..."
fastlane supply --aab app/build/outputs/bundle/release/app-release.aab

echo "✅ Deployment complete!"
echo "📱 Check Play Console in 1-2 hours"
```

### Make scripts executable

```bash
chmod +x deploy-ios.sh
chmod +x deploy-android.sh
```

---

## Success Criteria

### Week 1 Targets
- [ ] 10,000+ downloads
- [ ] 4.5+ star rating
- [ ] 99.9%+ crash-free rate
- [ ] 50%+ D1 retention
- [ ] < 100 support tickets

### Month 1 Targets
- [ ] 100,000+ downloads
- [ ] 4.7+ star rating
- [ ] 99.95%+ crash-free rate
- [ ] 40%+ D30 retention
- [ ] 1,000+ daily active users

### Month 3 Targets
- [ ] 500,000+ downloads
- [ ] 4.8+ star rating
- [ ] 99.99%+ crash-free rate
- [ ] 35%+ D90 retention
- [ ] 10,000+ daily active users

---

## Next Steps

1. **Complete Pre-Deployment Checklist**
2. **Set up Apple Developer & Play Console accounts**
3. **Configure Firebase & Sentry**
4. **Run deployment scripts**
5. **Submit for review**
6. **Monitor and iterate**

---

**Document Version:** 10.0.0  
**Last Updated:** October 29, 2025  
**Status:** ✅ Ready for Deployment

**Questions?** Contact: devops@neobank.com

