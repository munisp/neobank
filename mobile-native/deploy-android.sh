#!/bin/bash

# NeoBank Android Deployment Script
# Version: 10.0.0
# Deploys to Google Play Console

set -e  # Exit on error

echo "🚀 NeoBank Android Deployment to Play Console"
echo "============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to project root
cd "$(dirname "$0")"

# Check if Android SDK is available
if [ -z "$ANDROID_HOME" ]; then
    echo -e "${RED}❌ Error: ANDROID_HOME is not set${NC}"
    echo "Please install Android Studio and set ANDROID_HOME"
    exit 1
fi

# Check if keystore exists
if [ ! -f "android/app/neobank-release.keystore" ]; then
    echo -e "${YELLOW}⚠️  Release keystore not found${NC}"
    echo "Generating new keystore..."
    
    keytool -genkeypair -v \
        -storetype PKCS12 \
        -keystore android/app/neobank-release.keystore \
        -alias neobank-key-alias \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000
    
    echo ""
    echo -e "${GREEN}✅ Keystore generated${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Save the keystore password securely!${NC}"
    echo ""
fi

# Check if gradle.properties has signing config
if ! grep -q "NEOBANK_RELEASE_STORE_FILE" android/gradle.properties; then
    echo -e "${YELLOW}⚠️  Signing configuration not found in gradle.properties${NC}"
    echo "Please add the following to android/gradle.properties:"
    echo ""
    echo "NEOBANK_RELEASE_STORE_FILE=neobank-release.keystore"
    echo "NEOBANK_RELEASE_KEY_ALIAS=neobank-key-alias"
    echo "NEOBANK_RELEASE_STORE_PASSWORD=your_keystore_password"
    echo "NEOBANK_RELEASE_KEY_PASSWORD=your_key_password"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Install Node dependencies
echo "📦 Installing Node dependencies..."
npm install

# Navigate to Android directory
cd android

# Clean
echo "🧹 Cleaning build..."
./gradlew clean

# Get current version
VERSION_NAME=$(grep "versionName" app/build.gradle | awk '{print $2}' | tr -d '"')
VERSION_CODE=$(grep "versionCode" app/build.gradle | awk '{print $2}')

echo -e "${GREEN}📱 Building version ${VERSION_NAME} (${VERSION_CODE})${NC}"
echo ""

# Build AAB (Android App Bundle)
echo "🏗️  Building release AAB..."
echo "This may take 5-10 minutes..."
echo ""

./gradlew bundleRelease

# Check if build was successful
if [ ! -f "app/build/outputs/bundle/release/app-release.aab" ]; then
    echo -e "${RED}❌ Build failed - AAB not found${NC}"
    exit 1
fi

# Get AAB file size
AAB_SIZE=$(du -h app/build/outputs/bundle/release/app-release.aab | cut -f1)

echo ""
echo -e "${GREEN}✅ Build successful!${NC}"
echo "📦 AAB size: ${AAB_SIZE}"
echo ""

# Optional: Build APK for testing
echo "🏗️  Building release APK for testing..."
./gradlew assembleRelease

if [ -f "app/build/outputs/apk/release/app-release.apk" ]; then
    APK_SIZE=$(du -h app/build/outputs/apk/release/app-release.apk | cut -f1)
    echo -e "${GREEN}✅ APK built successfully${NC}"
    echo "📦 APK size: ${APK_SIZE}"
else
    echo -e "${YELLOW}⚠️  APK build failed (optional)${NC}"
fi

echo ""
echo -e "${GREEN}✅ Deployment package ready!${NC}"
echo ""
echo "📱 Version ${VERSION_NAME} (${VERSION_CODE})"
echo "📦 AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "Next steps:"
echo "1. Go to https://play.google.com/console"
echo "2. Select NeoBank app"
echo "3. Go to Release → Production (or Testing track)"
echo "4. Click 'Create new release'"
echo "5. Upload the AAB file"
echo "6. Add release notes"
echo "7. Review and rollout"
echo ""
echo "Alternative: Use Fastlane for automated upload"
echo "  fastlane supply --aab app/build/outputs/bundle/release/app-release.aab"
echo ""

# Optional: Open Play Console
read -p "Open Play Console in browser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "https://play.google.com/console"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"

