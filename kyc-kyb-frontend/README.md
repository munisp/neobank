# NeoBank KYC/KYB Frontend

A production-ready Next.js 14 frontend application for NeoBank's KYC (Know Your Customer) and KYB (Know Your Business) verification platform.

## 🚀 Features

### KYC (Know Your Customer)
- **Multi-Tier Verification**: Basic, Enhanced, and Premium KYC tiers
- **Personal Information Collection**: Comprehensive form validation
- **Document Upload**: Support for passport, driver's license, national ID
- **Address Verification**: Utility bills and bank statements
- **Biometric Verification**: Selfie capture and liveness detection
- **Identity Verification**: Government-issued ID verification
- **AML/PEP Screening**: Sanctions and adverse media checks
- **Real-time Status Tracking**: Progress visualization

### KYB (Know Your Business)
- **Business Information**: Company details and registration
- **CAC Verification**: Nigerian Corporate Affairs Commission integration
- **UBO Management**: Ultimate Beneficial Owners tracking
- **Financial Information**: Revenue, employees, transaction volume
- **Document Management**: Certificate of incorporation, MOA, AOA
- **Risk Assessment**: Business risk scoring

### Video KYC
- **Session Scheduling**: Book video verification appointments
- **Real-time Video**: Live agent verification
- **Recording**: Session recording for compliance

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/ui + Radix UI
- **State Management**: Zustand
- **Form Handling**: React Hook Form
- **Validation**: Zod
- **HTTP Client**: Axios
- **Notifications**: Sonner
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or 20+
- pnpm (recommended) or npm
- Backend API running on `http://localhost:8000`

### Installation

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Set up environment variables**
   Create a `.env.local` file:
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

3. **Run the development server**
   ```bash
   pnpm dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── kyc/               # KYC flow pages
│   ├── kyb/               # KYB flow pages
│   └── video-kyc/         # Video KYC pages
├── components/            # React components
│   ├── ui/               # UI components (Shadcn/ui)
│   ├── kyc/              # KYC-specific components
│   ├── kyb/              # KYB-specific components
│   └── shared/           # Shared components
├── lib/                  # Core library code
│   ├── api/             # API services
│   ├── stores/          # Zustand stores
│   ├── utils/           # Utility functions
│   └── validations/     # Zod schemas
└── public/              # Static assets
```

## 📝 API Integration

The frontend integrates with 55 backend endpoints across 9 routers:
- KYC (6 endpoints)
- KYB (5 endpoints)
- Video KYC (8 endpoints)
- Authentication (10 endpoints)
- Accounts, Transactions, Fraud Detection, Credit, Documents, Analytics

## 🎨 Customization

### Theming
Customize colors and design tokens in `app/globals.css`

### Components
All UI components can be customized in `components/ui/`

## 📦 Building for Production

```bash
pnpm build
pnpm start
```

## 🚀 Deployment

### Vercel (Recommended)
1. Push to GitHub
2. Import in Vercel
3. Set environment variables
4. Deploy

---

**Built with ❤️ by the NeoBank Team**
