# NeoBank Frontend Deployment Guide

## 📦 Package Contents

This package contains a production-ready Next.js 14 frontend for the NeoBank KYC/KYB platform.

### What's Included

**Core Infrastructure (11 files)**
- API client with authentication and error handling
- KYC, KYB, Video KYC, and Auth API services
- Zustand stores for state management
- Utility functions and validation schemas

**UI Components (12 files)**
- Shadcn/ui components (Button, Input, Card, Select, Dialog, Tabs, Progress, Badge, Alert)
- Shared components (Document Upload, Status Tracker, Loading Spinner)

**Pages (2 starter pages)**
- KYC initiation page
- KYC personal information page

**Configuration**
- Tailwind CSS with custom theme
- TypeScript configuration
- Next.js configuration
- Environment variables template

## 🚀 Quick Start

### 1. Extract the Package

```bash
tar -xzf neobank-frontend-v1.0.tar.gz
cd neobank-kyc-kyb-frontend
```

### 2. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 3. Configure Environment

Create `.env.local` file:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 4. Run Development Server

```bash
pnpm dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📋 Next Steps

### Complete the Implementation

Follow the `IMPLEMENTATION_GUIDE.md` to implement the remaining pages:

**KYC Flow (5 remaining pages)**
- Address information
- Identity verification
- Document upload
- Biometric verification
- Application status

**KYB Flow (6 pages)**
- KYB initiation
- Business information
- CAC verification
- UBO management
- Financial information
- Application status

**Video KYC (3 pages)**
- Schedule session
- Video session
- Sessions list

### File Structure Reference

```
app/
├── kyc/
│   ├── page.tsx ✅ (Completed)
│   └── [applicationId]/
│       ├── personal-info/page.tsx ✅ (Completed)
│       ├── address/page.tsx ⏳ (To implement)
│       ├── identity/page.tsx ⏳ (To implement)
│       ├── documents/page.tsx ⏳ (To implement)
│       ├── biometric/page.tsx ⏳ (To implement)
│       └── status/page.tsx ⏳ (To implement)
├── kyb/
│   ├── page.tsx ⏳ (To implement)
│   └── [applicationId]/
│       ├── business-info/page.tsx ⏳ (To implement)
│       ├── cac-verification/page.tsx ⏳ (To implement)
│       ├── ubos/page.tsx ⏳ (To implement)
│       ├── financial/page.tsx ⏳ (To implement)
│       └── status/page.tsx ⏳ (To implement)
└── video-kyc/
    ├── schedule/page.tsx ⏳ (To implement)
    ├── session/[sessionId]/page.tsx ⏳ (To implement)
    └── sessions/page.tsx ⏳ (To implement)
```

## 🏗️ Building for Production

### 1. Build the Application

```bash
pnpm build
```

### 2. Test Production Build Locally

```bash
pnpm start
```

### 3. Deploy to Vercel

**Option A: Using Vercel CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Option B: Using Vercel Dashboard**

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Set environment variables
5. Deploy

### 4. Deploy to Other Platforms

**Docker Deployment**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g pnpm && pnpm build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t neobank-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_BASE_URL=https://api.neobank.com neobank-frontend
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | Yes | `http://localhost:8000` |

### Backend API Requirements

The frontend expects the backend API to be running with the following endpoints:

**KYC Endpoints**
- `POST /kyc/initiate`
- `GET /kyc/applications/{id}`
- `POST /kyc/applications/{id}/personal-info`
- `POST /kyc/applications/{id}/address`
- `POST /kyc/applications/{id}/identity`
- `POST /kyc/applications/{id}/documents`
- `POST /kyc/applications/{id}/biometric`
- `POST /kyc/applications/{id}/submit`

**KYB Endpoints**
- `POST /kyb/initiate`
- `GET /kyb/applications/{id}`
- `POST /kyb/applications/{id}/business-info`
- `POST /kyb/applications/{id}/cac-verification`
- `POST /kyb/applications/{id}/ubos`
- `POST /kyb/applications/{id}/financial-info`
- `POST /kyb/applications/{id}/documents`
- `POST /kyb/applications/{id}/submit`

**Video KYC Endpoints**
- `GET /video-kyc/availability`
- `POST /video-kyc/schedule`
- `GET /video-kyc/sessions/{id}`
- `POST /video-kyc/sessions/{id}/start`
- `POST /video-kyc/sessions/{id}/complete`

**Authentication Endpoints**
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `GET /auth/me`

## 🧪 Testing

### Run Tests (when implemented)

```bash
pnpm test
```

### Manual Testing Checklist

- [ ] KYC initiation flow works
- [ ] Personal information form submits correctly
- [ ] Form validation works as expected
- [ ] API calls succeed with backend
- [ ] Error handling displays appropriate messages
- [ ] Loading states show during API calls
- [ ] Navigation between pages works
- [ ] Responsive design works on mobile
- [ ] Toast notifications appear correctly

## 🐛 Troubleshooting

### Common Issues

**Issue: API calls fail with CORS error**
- Solution: Ensure backend has CORS configured to allow frontend origin

**Issue: Environment variables not working**
- Solution: Restart dev server after changing `.env.local`
- Ensure variables start with `NEXT_PUBLIC_` for client-side access

**Issue: Build fails**
- Solution: Run `pnpm install` to ensure all dependencies are installed
- Check for TypeScript errors with `pnpm type-check`

**Issue: Styles not applying**
- Solution: Ensure Tailwind CSS is configured correctly
- Check `tailwind.config.ts` includes all content paths

## 📊 Performance Optimization

### Recommendations

1. **Image Optimization**: Use Next.js `Image` component
2. **Code Splitting**: Leverage Next.js automatic code splitting
3. **API Caching**: Implement React Query for API caching
4. **Lazy Loading**: Use dynamic imports for heavy components
5. **Bundle Analysis**: Run `pnpm build` and analyze bundle size

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env.local` to version control
2. **API Keys**: Store sensitive keys on server-side only
3. **Authentication**: Implement proper JWT token handling
4. **HTTPS**: Always use HTTPS in production
5. **Input Validation**: Use Zod schemas for all form inputs
6. **XSS Protection**: Next.js provides built-in XSS protection
7. **CSRF Protection**: Implement CSRF tokens for sensitive operations

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Deployment](https://vercel.com/docs)
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- [README](./README.md)

## 🤝 Support

For technical support or questions:
- Review the `IMPLEMENTATION_GUIDE.md` for detailed implementation instructions
- Check the `README.md` for project overview
- Contact the NeoBank development team

---

**Version**: 1.0.0  
**Last Updated**: 2025-01-31  
**Status**: Foundation Complete - Ready for Extension
