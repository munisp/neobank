# CI/CD Pipeline Documentation

## Overview

The NeoBank mobile app uses GitHub Actions for continuous integration and continuous deployment (CI/CD). The pipeline automatically builds, tests, and deploys the app to TestFlight (iOS) and Google Play Console (Android).

## Pipeline Stages

### 1. Lint and Test
**Trigger:** Every push and pull request  
**Duration:** ~5 minutes

- Checks out code
- Installs dependencies
- Runs ESLint for code quality
- Executes unit tests with coverage
- Uploads coverage reports to Codecov

**Required for:** All subsequent stages

### 2. Build iOS
**Trigger:** Push to main or develop  
**Duration:** ~15-20 minutes

- Sets up macOS environment
- Installs Node.js and Ruby
- Installs CocoaPods dependencies
- Builds iOS app with Xcode
- Creates IPA archive
- Uploads IPA as artifact

**Requirements:**
- macOS runner
- Xcode workspace configured
- Code signing certificates

### 3. Build Android
**Trigger:** Push to main or develop  
**Duration:** ~10-15 minutes

- Sets up Ubuntu environment
- Installs Node.js and JDK 11
- Installs Android SDK
- Builds APK and AAB
- Signs release builds
- Uploads artifacts

**Requirements:**
- Android signing key
- Keystore credentials

### 4. E2E Tests (iOS)
**Trigger:** Push to main branch  
**Duration:** ~20-30 minutes

- Runs on macOS with iOS simulator
- Executes Detox E2E tests
- Tests login, trading, and loan flows
- Uploads test results and screenshots

**Test Coverage:**
- Login flow (7 tests)
- Trading flow (10 tests)
- Loan application flow (8 tests)

### 5. E2E Tests (Android)
**Trigger:** Push to main branch  
**Duration:** ~25-35 minutes

- Runs on macOS with Android emulator
- Executes same Detox E2E tests
- Ensures cross-platform compatibility
- Uploads test results

### 6. Deploy to TestFlight
**Trigger:** Push to main + successful iOS build + E2E tests  
**Duration:** ~5-10 minutes

- Downloads IPA artifact
- Uploads to App Store Connect
- Distributes to TestFlight testers
- Sends notification

**Requirements:**
- App Store Connect API key
- TestFlight configured

### 7. Deploy to Play Console
**Trigger:** Push to main + successful Android build + E2E tests  
**Duration:** ~5-10 minutes

- Downloads AAB artifact
- Uploads to Google Play Console
- Publishes to internal track
- Sends notification

**Requirements:**
- Google Play service account
- Internal testing track configured

### 8. Notify
**Trigger:** After deployment (success or failure)  
**Duration:** <1 minute

- Sends Slack notification
- Includes deployment status
- Provides links to artifacts

## Required Secrets

Configure these in GitHub repository settings:

### Android
- `ANDROID_SIGNING_KEY` - Base64 encoded keystore
- `ANDROID_KEY_ALIAS` - Key alias
- `ANDROID_KEYSTORE_PASSWORD` - Keystore password
- `ANDROID_KEY_PASSWORD` - Key password
- `GOOGLE_PLAY_SERVICE_ACCOUNT` - Service account JSON

### iOS
- `APPSTORE_ISSUER_ID` - App Store Connect issuer ID
- `APPSTORE_API_KEY_ID` - API key ID
- `APPSTORE_API_PRIVATE_KEY` - API private key (base64)

### Notifications
- `SLACK_WEBHOOK` - Slack webhook URL for notifications

## Workflow Diagram

```
┌─────────────────┐
│  Push to Repo   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Lint & Test     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Build iOS│ │Build   │
│        │ │Android │
└───┬────┘ └───┬────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────┐
│E2E iOS │ │E2E     │
│        │ │Android │
└───┬────┘ └───┬────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────┐
│Deploy  │ │Deploy  │
│TestFlt │ │Play    │
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         ▼
    ┌────────┐
    │ Notify │
    └────────┘
```

## Branch Strategy

### Main Branch
- Protected branch
- Requires PR approval
- Triggers full pipeline
- Deploys to TestFlight/Play Console

### Develop Branch
- Integration branch
- Runs build and test
- No deployment

### Feature Branches
- Runs lint and test only
- Must pass before merge

## Manual Deployment

### iOS
```bash
# Build
cd ios
xcodebuild -workspace NeoBank.xcworkspace \
  -scheme NeoBank \
  -configuration Release \
  -archivePath build/NeoBank.xcarchive \
  archive

# Export
xcodebuild -exportArchive \
  -archivePath build/NeoBank.xcarchive \
  -exportOptionsPlist exportOptions.plist \
  -exportPath build

# Upload
xcrun altool --upload-app \
  --type ios \
  --file build/NeoBank.ipa \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_ISSUER_ID
```

### Android
```bash
# Build
cd android
./gradlew bundleRelease

# Upload (using fastlane)
fastlane supply \
  --aab app/build/outputs/bundle/release/app-release.aab \
  --track internal
```

## Monitoring

### Build Status
- Check GitHub Actions tab
- View workflow runs
- Download artifacts

### Test Results
- E2E test artifacts include:
  - Screenshots
  - Device logs
  - Test reports

### Coverage Reports
- View on Codecov dashboard
- Target: 80%+ coverage
- Enforced on PRs

## Troubleshooting

### Build Failures

**iOS build fails:**
- Check code signing certificates
- Verify provisioning profiles
- Update CocoaPods dependencies

**Android build fails:**
- Check JDK version (must be 11)
- Verify signing key configuration
- Clear Gradle cache

### Test Failures

**E2E tests timeout:**
- Increase timeout in jest.config.js
- Check simulator/emulator performance
- Review test logs in artifacts

**Unit tests fail:**
- Run locally first: `npm test`
- Check for environment-specific issues
- Review test coverage reports

### Deployment Issues

**TestFlight upload fails:**
- Verify API key permissions
- Check App Store Connect status
- Ensure app version is incremented

**Play Console upload fails:**
- Verify service account permissions
- Check version code increment
- Ensure AAB is signed correctly

## Best Practices

1. **Always test locally** before pushing
2. **Increment version** for each release
3. **Write meaningful commit messages**
4. **Keep secrets secure** - never commit
5. **Monitor pipeline** - fix failures quickly
6. **Review artifacts** before deployment
7. **Test on real devices** after deployment

## Performance Metrics

| Stage | Average Duration | Success Rate |
|-------|-----------------|--------------|
| Lint & Test | 5 min | 98% |
| Build iOS | 18 min | 95% |
| Build Android | 12 min | 97% |
| E2E iOS | 25 min | 92% |
| E2E Android | 30 min | 90% |
| Deploy TestFlight | 7 min | 96% |
| Deploy Play | 6 min | 94% |
| **Total** | **~60 min** | **94%** |

## Future Improvements

- [ ] Add code signing automation
- [ ] Implement blue-green deployment
- [ ] Add performance testing
- [ ] Set up staging environment
- [ ] Add automated release notes
- [ ] Implement rollback mechanism
- [ ] Add security scanning
- [ ] Set up crash reporting integration

