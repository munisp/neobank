# CI/CD Setup Guide

Complete guide to setting up automated builds and deployments for iOS and Android.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [GitHub Secrets Configuration](#github-secrets-configuration)
4. [iOS Setup](#ios-setup)
5. [Android Setup](#android-setup)
6. [Workflow Triggers](#workflow-triggers)
7. [Manual Deployment](#manual-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Our CI/CD pipeline automates:

- ✅ Code linting and quality checks
- ✅ Unit and integration testing
- ✅ iOS build and TestFlight deployment
- ✅ Android build and Play Console deployment
- ✅ E2E testing with Detox
- ✅ Security scanning
- ✅ GitHub release creation
- ✅ Slack notifications

**Pipeline Stages:**

```
Code Push → Lint → Test → Build (iOS/Android) → Deploy → Notify
```

---

## Prerequisites

### Required Accounts

1. **GitHub** - Repository hosting
2. **Apple Developer** - iOS distribution ($99/year)
3. **Google Play Console** - Android distribution ($25 one-time)
4. **Slack** (Optional) - Build notifications

### Required Tools

- Git
- Node.js 18+
- Xcode (for iOS)
- Android Studio (for Android)
- Fastlane (optional, for local builds)

---

## GitHub Secrets Configuration

Navigate to: **Repository → Settings → Secrets and variables → Actions**

### iOS Secrets

#### 1. `IOS_CERTIFICATES_P12`

**Description:** Base64-encoded P12 certificate file

**How to Generate:**

```bash
# Export certificate from Keychain
# File → Export Items → Select certificate → Save as .p12

# Convert to base64
base64 -i Certificates.p12 | pbcopy
```

**Paste the base64 string into GitHub secret**

---

#### 2. `IOS_CERTIFICATES_PASSWORD`

**Description:** Password for the P12 certificate

**Value:** The password you set when exporting the P12 file

---

#### 3. `APPSTORE_ISSUER_ID`

**Description:** App Store Connect API Issuer ID

**How to Get:**

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to: **Users and Access → Keys**
3. Copy the **Issuer ID** (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

---

#### 4. `APPSTORE_API_KEY_ID`

**Description:** App Store Connect API Key ID

**How to Get:**

1. Go to: **App Store Connect → Users and Access → Keys**
2. Click **"+"** to create new key
3. Name: "GitHub Actions"
4. Access: **App Manager**
5. Click **Generate**
6. Copy the **Key ID** (format: `XXXXXXXXXX`)

---

#### 5. `APPSTORE_API_PRIVATE_KEY`

**Description:** App Store Connect API Private Key (.p8 file content)

**How to Get:**

1. After creating the API key, click **Download API Key**
2. Save the `.p8` file
3. **Important:** You can only download this once!

**Convert to secret:**

```bash
# Read the .p8 file content
cat AuthKey_XXXXXXXXXX.p8 | pbcopy
```

**Paste the entire content (including BEGIN/END lines) into GitHub secret**

---

### Android Secrets

#### 1. `ANDROID_SIGNING_KEY`

**Description:** Base64-encoded Android keystore file

**How to Generate:**

```bash
# Generate keystore (if you don't have one)
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore neobank-release.keystore \
  -alias neobank-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Convert to base64
base64 -i neobank-release.keystore | pbcopy
```

**Paste the base64 string into GitHub secret**

**⚠️ IMPORTANT:** Keep the original keystore file safe! You cannot regenerate it.

---

#### 2. `ANDROID_KEYSTORE_PASSWORD`

**Description:** Keystore password

**Value:** The password you set when creating the keystore

---

#### 3. `ANDROID_KEY_ALIAS`

**Description:** Key alias name

**Value:** The alias you used (e.g., `neobank-key`)

---

#### 4. `ANDROID_KEY_PASSWORD`

**Description:** Key password

**Value:** The key password (often same as keystore password)

---

#### 5. `GOOGLE_PLAY_SERVICE_ACCOUNT`

**Description:** Google Play Console service account JSON

**How to Create:**

1. Go to [Google Play Console](https://play.google.com/console)
2. Navigate to: **Setup → API access**
3. Click **Create new service account**
4. Follow link to Google Cloud Console
5. Create service account:
   - Name: "GitHub Actions"
   - Role: **Service Account User**
6. Create JSON key:
   - Click on service account
   - **Keys → Add Key → Create new key**
   - Type: **JSON**
   - Download the JSON file

7. Grant permissions in Play Console:
   - Go back to Play Console
   - Click **Grant access** for the service account
   - Permissions: **Admin** (or specific app permissions)

**Add to GitHub:**

```bash
# Copy JSON content
cat service-account.json | pbcopy
```

**Paste the entire JSON content into GitHub secret**

---

### Optional Secrets

#### 1. `SLACK_WEBHOOK`

**Description:** Slack webhook URL for notifications

**How to Create:**

1. Go to your Slack workspace
2. Navigate to: **Apps → Incoming Webhooks**
3. Click **Add to Slack**
4. Choose channel (e.g., #deployments)
5. Copy the **Webhook URL**

**Format:** `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`

---

#### 2. `SNYK_TOKEN`

**Description:** Snyk API token for security scanning

**How to Get:**

1. Sign up at [snyk.io](https://snyk.io)
2. Go to: **Account Settings → API Token**
3. Copy the token

---

## iOS Setup

### 1. Xcode Project Configuration

**File:** `ios/NeoBank.xcodeproj/project.pbxproj`

Ensure the following are configured:

- **Bundle Identifier:** `com.neobank`
- **Team:** Your Apple Developer team
- **Signing:** Automatic signing enabled

### 2. Export Options

**File:** `ios/ExportOptions.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
    <key>uploadBitcode</key>
    <false/>
    <key>compileBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
```

Replace `YOUR_TEAM_ID` with your Apple Developer Team ID.

### 3. App Store Connect Setup

1. Create app in App Store Connect
2. Set Bundle ID: `com.neobank`
3. Configure app metadata
4. Add TestFlight beta information

---

## Android Setup

### 1. Gradle Configuration

**File:** `android/app/build.gradle`

Ensure signing configuration:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('NEOBANK_UPLOAD_STORE_FILE')) {
                storeFile file(NEOBANK_UPLOAD_STORE_FILE)
                storePassword NEOBANK_UPLOAD_STORE_PASSWORD
                keyAlias NEOBANK_UPLOAD_KEY_ALIAS
                keyPassword NEOBANK_UPLOAD_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 2. Release Notes

**Directory:** `android/release-notes/`

Create language-specific release notes:

```
android/release-notes/
├── en-US/
│   └── default.txt
├── es-ES/
│   └── default.txt
└── fr-FR/
    └── default.txt
```

**Example:** `android/release-notes/en-US/default.txt`

```
Version 1.0.0 - Initial Release

• Complete digital banking
• Stock and crypto trading
• Loan management
• Credit score monitoring
• Mobile payments
```

### 3. Play Console Setup

1. Create app in Play Console
2. Set Package name: `com.neobank`
3. Configure app metadata
4. Set up Internal Testing track

---

## Workflow Triggers

### Automatic Triggers

**1. Push to `main` branch:**
- Runs lint and tests
- Builds iOS and Android
- Deploys to TestFlight and Play Console

**2. Push to `develop` branch:**
- Runs lint and tests
- Runs E2E tests
- No deployment

**3. Pull Request:**
- Runs lint and tests
- Runs E2E tests
- No deployment

**4. Tag push (v*):**
- Runs full pipeline
- Creates GitHub release
- Deploys to stores

### Manual Triggers

**Workflow Dispatch:**

1. Go to: **Actions → Mobile CI/CD Pipeline**
2. Click **Run workflow**
3. Select branch
4. Choose deployment options:
   - Deploy to TestFlight: `true/false`
   - Deploy to Play Console: `true/false`
5. Click **Run workflow**

---

## Manual Deployment

### Using GitHub Actions UI

**Step 1:** Navigate to Actions tab

**Step 2:** Select "Mobile CI/CD Pipeline"

**Step 3:** Click "Run workflow"

**Step 4:** Configure options:
- Branch: `main`
- Deploy iOS: `true`
- Deploy Android: `true`

**Step 5:** Click "Run workflow"

**Step 6:** Monitor progress in real-time

### Using Git Tags

```bash
# Create and push a tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

This automatically triggers the full pipeline and creates a GitHub release.

---

## Workflow Stages Explained

### Stage 1: Lint & Code Quality

**Duration:** ~2 minutes

**Actions:**
- ESLint checks
- TypeScript compilation
- Prettier formatting check

**Failure Handling:** Pipeline stops if critical errors found

---

### Stage 2: Tests

**Duration:** ~5 minutes

**Actions:**
- Unit tests
- Integration tests
- Coverage report
- Upload to Codecov

**Failure Handling:** Pipeline stops if tests fail

---

### Stage 3: iOS Build

**Duration:** ~15-20 minutes

**Actions:**
- Install dependencies
- Install CocoaPods
- Import certificates
- Download provisioning profiles
- Increment build number
- Build archive
- Export IPA
- Upload to TestFlight

**Artifacts:** IPA file

**Failure Handling:** Slack notification sent

---

### Stage 4: Android Build

**Duration:** ~10-15 minutes

**Actions:**
- Install dependencies
- Decode keystore
- Increment version code
- Build AAB and APK
- Sign AAB
- Upload to Play Console

**Artifacts:** AAB and APK files

**Failure Handling:** Slack notification sent

---

### Stage 5: E2E Tests

**Duration:** ~10-15 minutes

**Actions:**
- Build Detox
- Run E2E tests
- Upload test results

**Runs On:** Pull requests and develop branch

---

### Stage 6: Create Release

**Duration:** ~2 minutes

**Actions:**
- Download build artifacts
- Generate changelog
- Create GitHub release
- Attach IPA, AAB, APK

**Runs On:** Tag pushes only

---

### Stage 7: Security Scan

**Duration:** ~3 minutes

**Actions:**
- Snyk security scan
- npm audit

**Failure Handling:** Continues on error (informational)

---

### Stage 8: Performance

**Duration:** ~2 minutes

**Actions:**
- Bundle size analysis
- Comment on PR

**Runs On:** Main branch and PRs

---

## Monitoring and Notifications

### Slack Notifications

Notifications are sent for:

- ✅ iOS build success
- ❌ iOS build failure
- ✅ Android build success
- ❌ Android build failure
- 🚀 GitHub release created

**Notification Format:**

```
✅ iOS Build & Deploy Successful 🎉

Branch: main
Commit: abc1234
Deployed to: TestFlight
```

### GitHub Actions UI

Monitor builds in real-time:

1. Go to **Actions** tab
2. Click on workflow run
3. View logs for each job
4. Download artifacts

### Email Notifications

GitHub sends email notifications for:

- Workflow failures
- Workflow completions (if configured)

**Configure:** Settings → Notifications → Actions

---

## Troubleshooting

### iOS Build Failures

#### Error: "Code signing failed"

**Solution:**
1. Verify `IOS_CERTIFICATES_P12` is correct
2. Check `IOS_CERTIFICATES_PASSWORD`
3. Ensure certificate is valid and not expired
4. Verify Bundle ID matches certificate

#### Error: "Provisioning profile not found"

**Solution:**
1. Verify App Store Connect API credentials
2. Check Bundle ID in Xcode matches App Store Connect
3. Ensure provisioning profile exists for Bundle ID

#### Error: "Upload to TestFlight failed"

**Solution:**
1. Check App Store Connect API key permissions
2. Verify app exists in App Store Connect
3. Check TestFlight beta information is complete

---

### Android Build Failures

#### Error: "Keystore not found"

**Solution:**
1. Verify `ANDROID_SIGNING_KEY` is base64-encoded correctly
2. Check secret name matches workflow file
3. Ensure keystore is PKCS12 format

#### Error: "Upload to Play Console failed"

**Solution:**
1. Verify service account JSON is correct
2. Check service account has correct permissions
3. Ensure app exists in Play Console
4. Verify package name matches

#### Error: "Version code already exists"

**Solution:**
1. Increment version code manually in `build.gradle`
2. Or wait for automatic increment in workflow

---

### General Issues

#### Error: "npm ci failed"

**Solution:**
1. Check `package-lock.json` is committed
2. Verify Node.js version compatibility
3. Clear npm cache: `npm cache clean --force`

#### Error: "Tests failed"

**Solution:**
1. Run tests locally: `npm test`
2. Fix failing tests
3. Commit and push fixes

#### Error: "Slack notification failed"

**Solution:**
1. Verify `SLACK_WEBHOOK` secret is set
2. Check webhook URL is valid
3. Ensure Slack app has permissions

---

## Best Practices

### 1. Version Management

**Use Semantic Versioning:**
- Major: Breaking changes (v2.0.0)
- Minor: New features (v1.1.0)
- Patch: Bug fixes (v1.0.1)

**Tag Format:**
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
```

### 2. Branch Strategy

**Recommended:**
- `main` - Production releases
- `develop` - Development branch
- `feature/*` - Feature branches
- `hotfix/*` - Urgent fixes

### 3. Commit Messages

**Format:**
```
type(scope): subject

body

footer
```

**Example:**
```
feat(auth): add biometric authentication

Implemented Face ID and Touch ID support for iOS and Android.

Closes #123
```

### 4. Testing Before Merge

**Always:**
1. Run tests locally
2. Test on physical devices
3. Review code changes
4. Update documentation

### 5. Secrets Management

**Security:**
- Never commit secrets to repository
- Rotate secrets regularly
- Use separate secrets for dev/prod
- Limit secret access to necessary people

### 6. Monitoring

**Track:**
- Build success rate
- Build duration
- Test coverage
- Deployment frequency
- Time to production

---

## Advanced Configuration

### Custom Build Scripts

**Add to `package.json`:**

```json
{
  "scripts": {
    "ios:build": "cd ios && xcodebuild ...",
    "android:build": "cd android && ./gradlew bundleRelease",
    "test:e2e": "detox test",
    "analyze": "npx react-native-bundle-visualizer"
  }
}
```

### Environment Variables

**Add to workflow:**

```yaml
env:
  API_URL: ${{ secrets.API_URL }}
  SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
```

### Matrix Builds

**Test multiple versions:**

```yaml
strategy:
  matrix:
    node-version: [16.x, 18.x, 20.x]
    os: [ubuntu-latest, macos-latest]
```

---

## Cost Optimization

### Reduce Build Time

1. **Cache Dependencies:**
   - npm cache
   - CocoaPods cache
   - Gradle cache

2. **Parallel Jobs:**
   - Run iOS and Android in parallel
   - Run tests in parallel

3. **Conditional Builds:**
   - Only build on specific branches
   - Skip builds for documentation changes

### Reduce GitHub Actions Minutes

**Free Tier:**
- 2,000 minutes/month (Linux)
- 1,000 minutes/month (macOS)

**Tips:**
- Use Linux for tests (cheaper)
- Use macOS only for iOS builds
- Cache aggressively
- Skip unnecessary builds

---

## Support

### Documentation

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Fastlane Docs](https://docs.fastlane.tools)
- [React Native Docs](https://reactnative.dev)

### Community

- GitHub Discussions
- Stack Overflow
- React Native Community

### Contact

For issues with this CI/CD setup:
- Email: devops@neobank.com
- Slack: #devops channel

---

## Changelog

### v1.0.0 (2025-10-29)
- Initial CI/CD pipeline
- iOS and Android builds
- TestFlight and Play Console deployment
- E2E testing with Detox
- Slack notifications
- Security scanning

---

**Last Updated:** October 29, 2025  
**Maintained By:** NeoBank DevOps Team

