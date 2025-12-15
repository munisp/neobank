#!/bin/bash

# NeoBank iOS Deployment Script
# Version: 10.0.0
# Deploys to TestFlight

set -e  # Exit on error

echo "🚀 NeoBank iOS Deployment to TestFlight"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ Error: iOS deployment must be run on macOS${NC}"
    exit 1
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}❌ Error: Xcode is not installed${NC}"
    exit 1
fi

# Check if Fastlane is installed
if ! command -v fastlane &> /dev/null; then
    echo -e "${YELLOW}⚠️  Fastlane not found. Installing...${NC}"
    brew install fastlane
fi

# Check if CocoaPods is installed
if ! command -v pod &> /dev/null; then
    echo -e "${YELLOW}⚠️  CocoaPods not found. Installing...${NC}"
    sudo gem install cocoapods
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Install Node dependencies
echo "📦 Installing Node dependencies..."
npm install

# Navigate to iOS directory
cd ios

# Install CocoaPods dependencies
echo "📦 Installing CocoaPods dependencies..."
pod install

# Clean build folder
echo "🧹 Cleaning build folder..."
xcodebuild clean -workspace NeoBank.xcworkspace -scheme NeoBank

# Increment build number
echo "🔢 Incrementing build number..."
agvtool next-version -all

# Get current version
VERSION=$(agvtool what-marketing-version -terse1)
BUILD=$(agvtool what-version -terse)

echo -e "${GREEN}📱 Building version ${VERSION} (${BUILD})${NC}"
echo ""

# Build and upload to TestFlight
echo "🏗️  Building and uploading to TestFlight..."
echo "This may take 10-15 minutes..."
echo ""

fastlane beta

# Check if successful
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    echo "📱 Version ${VERSION} (${BUILD}) uploaded to TestFlight"
    echo "⏱️  Processing time: 5-10 minutes"
    echo "🔗 Check status: https://appstoreconnect.apple.com"
    echo ""
    echo "Next steps:"
    echo "1. Wait for processing to complete"
    echo "2. Add 'What to Test' notes in TestFlight"
    echo "3. Invite beta testers"
    echo "4. Monitor crash reports and feedback"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo "Check the error messages above for details"
    exit 1
fi

