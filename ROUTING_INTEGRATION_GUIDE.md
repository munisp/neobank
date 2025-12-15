# Routing Integration Guide
## New Pages and Screens Integration

**Date:** November 2, 2025  
**Status:** All 13 missing features implemented

---

## Frontend Web - Routing Updates Required

### New Pages to Add to Routes (6 pages)

Add these routes to your Next.js routing configuration (e.g., `app/` directory or `pages/` directory):

```javascript
// 1. NotificationsPage.jsx
{
  path: '/notifications',
  component: NotificationsPage,
  protected: true,
  title: 'Notifications'
}

// 2. InvestmentsPage.jsx
{
  path: '/investments',
  component: InvestmentsPage,
  protected: true,
  title: 'Investments'
}

// 3. InsurancePage.jsx
{
  path: '/insurance',
  component: InsurancePage,
  protected: true,
  title: 'Insurance'
}

// 4. InsuranceQuotePage.jsx
{
  path: '/insurance/quote',
  component: InsuranceQuotePage,
  protected: true,
  title: 'Get Insurance Quote'
}

// 5. TradingPage.jsx
{
  path: '/trading',
  component: TradingPage,
  protected: true,
  title: 'Trading'
}

// 6. InsuranceClaimsPage.jsx
{
  path: '/insurance/claims',
  component: InsuranceClaimsPage,
  protected: true,
  title: 'Insurance Claims'
}
```

### Navigation Menu Updates

Add these items to your navigation menu:

```javascript
// Main Navigation
{
  label: 'Investments',
  icon: 'TrendingUp',
  path: '/investments',
  badge: null
},
{
  label: 'Insurance',
  icon: 'Shield',
  path: '/insurance',
  badge: null
},
{
  label: 'Trading',
  icon: 'BarChart',
  path: '/trading',
  badge: null
},
{
  label: 'Notifications',
  icon: 'Bell',
  path: '/notifications',
  badge: 'unreadCount' // Dynamic badge for unread notifications
}
```

---

## Native Mobile - Navigation Updates Required

### New Screens to Add to Navigation (7 screens)

Add these screens to your React Native navigation configuration (e.g., `App.js` or navigation setup file):

```javascript
import SpendingInsightsScreen from './src/screens/SpendingInsightsScreen';
import CryptocurrencyScreen from './src/screens/CryptocurrencyScreen';
import StockTradingScreen from './src/screens/StockTradingScreen';
import InsuranceQuoteScreen from './src/screens/InsuranceQuoteScreen';
import InsurancePolicyScreen from './src/screens/InsurancePolicyScreen';
import InsuranceClaimsScreen from './src/screens/InsuranceClaimsScreen';
import OfflineScreen from './src/screens/OfflineScreen';

// Stack Navigator Configuration
const Stack = createStackNavigator();

function AppNavigator() {
  return (
    <Stack.Navigator>
      {/* Existing screens... */}
      
      {/* New Analytics Screen */}
      <Stack.Screen 
        name="SpendingInsights" 
        component={SpendingInsightsScreen}
        options={{ title: 'Spending Insights' }}
      />
      
      {/* New Investment Screens */}
      <Stack.Screen 
        name="Cryptocurrency" 
        component={CryptocurrencyScreen}
        options={{ title: 'Cryptocurrency' }}
      />
      <Stack.Screen 
        name="StockTrading" 
        component={StockTradingScreen}
        options={{ title: 'Stock Trading' }}
      />
      
      {/* New Insurance Screens */}
      <Stack.Screen 
        name="InsuranceQuote" 
        component={InsuranceQuoteScreen}
        options={{ title: 'Get Quote' }}
      />
      <Stack.Screen 
        name="InsurancePolicy" 
        component={InsurancePolicyScreen}
        options={{ title: 'Policy Details' }}
      />
      <Stack.Screen 
        name="InsuranceClaims" 
        component={InsuranceClaimsScreen}
        options={{ title: 'Claims' }}
      />
      
      {/* Utility Screen */}
      <Stack.Screen 
        name="Offline" 
        component={OfflineScreen}
        options={{ title: 'Offline Mode' }}
      />
    </Stack.Navigator>
  );
}
```

### Tab Navigator Updates

If using bottom tab navigation, add these tabs:

```javascript
// Bottom Tab Navigator
<Tab.Navigator>
  {/* Existing tabs... */}
  
  <Tab.Screen
    name="Investments"
    component={InvestmentsStackNavigator}
    options={{
      tabBarIcon: ({ color, size }) => (
        <Icon name="trending-up" size={size} color={color} />
      ),
    }}
  />
  
  <Tab.Screen
    name="Insurance"
    component={InsuranceStackNavigator}
    options={{
      tabBarIcon: ({ color, size }) => (
        <Icon name="shield" size={size} color={color} />
      ),
    }}
  />
</Tab.Navigator>
```

### Deep Linking Configuration

Add deep linking support for new screens:

```javascript
const linking = {
  prefixes: ['neobank://', 'https://neobank.com'],
  config: {
    screens: {
      // Existing screens...
      
      SpendingInsights: 'spending-insights',
      Cryptocurrency: 'crypto',
      StockTrading: 'trading',
      InsuranceQuote: 'insurance/quote',
      InsurancePolicy: 'insurance/policy/:policyId',
      InsuranceClaims: 'insurance/claims',
      Offline: 'offline',
    },
  },
};
```

---

## Integration Checklist

### Frontend Web

- [ ] Import all 6 new page components
- [ ] Add routes to routing configuration
- [ ] Update navigation menu with new links
- [ ] Add navigation icons
- [ ] Test all routes load correctly
- [ ] Verify protected routes require authentication
- [ ] Test navigation between pages
- [ ] Verify breadcrumbs (if applicable)
- [ ] Test responsive design on mobile
- [ ] Verify SEO metadata for each page

### Native Mobile

- [ ] Import all 7 new screen components
- [ ] Add screens to Stack Navigator
- [ ] Update Tab Navigator (if applicable)
- [ ] Configure deep linking
- [ ] Add navigation buttons/links to existing screens
- [ ] Test navigation flows
- [ ] Verify back button behavior
- [ ] Test screen transitions
- [ ] Verify header configurations
- [ ] Test on both iOS and Android

---

## Navigation Flow Examples

### Frontend Web Navigation Flow

```
Dashboard
  ├─> Investments
  │     ├─> Trading (stocks/crypto)
  │     └─> Portfolio Details
  │
  ├─> Insurance
  │     ├─> Get Quote
  │     ├─> My Policies
  │     └─> File Claim
  │
  └─> Notifications
        └─> Notification Details
```

### Native Mobile Navigation Flow

```
Home/Dashboard
  ├─> Budget
  │     └─> Spending Insights
  │
  ├─> Investments
  │     ├─> Cryptocurrency
  │     └─> Stock Trading
  │
  └─> Insurance
        ├─> Get Quote
        ├─> My Policies
        │     └─> Policy Details
        └─> Claims
              └─> File New Claim
```

---

## API Integration Notes

All new pages/screens are already integrated with backend API endpoints:

### Frontend Web
- **NotificationsPage:** Uses `/api/notifications` endpoints
- **InvestmentsPage:** Uses `/api/investments` endpoints
- **InsurancePage:** Uses `/api/insurance/products` endpoints
- **InsuranceQuotePage:** Uses `/api/insurance/quotes` endpoints
- **TradingPage:** Uses `/api/investments/trading` endpoints
- **InsuranceClaimsPage:** Uses `/api/insurance/claims` endpoints

### Native Mobile
- **SpendingInsightsScreen:** Uses `/api/analytics` endpoints
- **CryptocurrencyScreen:** Uses `/api/investments/crypto` endpoints
- **StockTradingScreen:** Uses `/api/investments/stocks` endpoints
- **InsuranceQuoteScreen:** Uses `/api/insurance/quotes` endpoints
- **InsurancePolicyScreen:** Uses `/api/insurance/policies` endpoints
- **InsuranceClaimsScreen:** Uses `/api/insurance/claims` endpoints
- **OfflineScreen:** Client-side only, no API

---

## Testing Recommendations

### Frontend Web Testing

1. **Route Testing**
   ```bash
   # Test each route loads
   npm run test:routes
   ```

2. **Navigation Testing**
   - Click all navigation links
   - Test browser back/forward buttons
   - Verify URL changes correctly
   - Test direct URL access

3. **Integration Testing**
   - Test API calls from each page
   - Verify data displays correctly
   - Test error handling
   - Verify loading states

### Native Mobile Testing

1. **Navigation Testing**
   ```bash
   # Run navigation tests
   npm run test:navigation
   ```

2. **Screen Testing**
   - Test all navigation flows
   - Verify screen transitions
   - Test back button behavior
   - Test deep linking

3. **Integration Testing**
   - Test API calls from each screen
   - Verify data displays correctly
   - Test error handling
   - Test offline behavior

---

## Performance Considerations

### Frontend Web

- **Code Splitting:** Consider lazy loading for new pages
  ```javascript
  const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'));
  const TradingPage = lazy(() => import('./pages/TradingPage'));
  ```

- **Prefetching:** Prefetch data for likely next pages
- **Caching:** Implement proper caching strategies for API calls

### Native Mobile

- **Screen Optimization:** Use `React.memo` for expensive components
- **List Optimization:** Use `FlatList` for long lists
- **Image Optimization:** Optimize and cache images
- **Navigation Optimization:** Use `lazy` prop for screens not immediately needed

---

## Security Considerations

### Authentication

All new pages/screens require authentication:
- Verify JWT tokens before API calls
- Redirect to login if token expired
- Implement token refresh logic
- Handle 401/403 responses appropriately

### Authorization

Implement role-based access control:
- Admin-only features (if applicable)
- Premium features (if applicable)
- Feature flags for gradual rollout

### Data Protection

- Encrypt sensitive data in transit (HTTPS)
- Sanitize user inputs
- Implement rate limiting
- Validate all API responses

---

## Deployment Notes

### Frontend Web Deployment

1. Build production bundle
   ```bash
   npm run build
   ```

2. Test production build locally
   ```bash
   npm run start:prod
   ```

3. Deploy to hosting platform
   - Vercel, Netlify, or custom server
   - Verify environment variables
   - Test all routes in production

### Native Mobile Deployment

1. Build iOS app
   ```bash
   npx react-native run-ios --configuration Release
   ```

2. Build Android app
   ```bash
   npx react-native run-android --variant=release
   ```

3. Submit to app stores
   - Update version numbers
   - Update release notes
   - Submit for review

---

## Monitoring and Analytics

### Track New Features

Add analytics tracking for new pages/screens:

```javascript
// Frontend Web
useEffect(() => {
  analytics.track('Page Viewed', {
    page: 'Investments',
    timestamp: new Date()
  });
}, []);

// Native Mobile
useEffect(() => {
  analytics.logScreenView({
    screen_name: 'Spending Insights',
    screen_class: 'SpendingInsightsScreen'
  });
}, []);
```

### Monitor Performance

- Track page load times
- Monitor API response times
- Track error rates
- Monitor user engagement

---

## Support and Maintenance

### Documentation

- Update user documentation
- Create help articles for new features
- Update API documentation
- Create video tutorials

### User Training

- Announce new features
- Provide in-app tutorials
- Send email notifications
- Create feature highlights

---

## Conclusion

All 13 missing features have been successfully implemented and are ready for integration. Follow this guide to properly integrate the new pages and screens into your routing configuration.

**Status:** ✅ Ready for Integration  
**Next Steps:** Update routing, test thoroughly, deploy to production

---

**Last Updated:** November 2, 2025  
**Version:** 1.0
