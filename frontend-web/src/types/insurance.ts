// Types and mock API for the standalone Insurance page.

export interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  basePremium: number;
}

export interface ActivePolicy {
  id: string;
  productName: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  premium: number;
  status: string;
}

export interface QuoteRequest {
  productId: string;
  age: number;
  location: string;
  coverageAmount: number;
}

export interface QuoteResponse {
  quoteId: string;
  monthlyPremium: number;
  premiumEstimate: number;
  validUntil: string;
}

export interface CoverageCalculation {
  recommendedCoverage: number;
  reasoning: string;
}

const PRODUCTS: InsuranceProduct[] = [
  {
    id: 'life-basic',
    name: 'Term Life Essential',
    description: 'Affordable term life cover for income protection.',
    category: 'Life',
    basePremium: 240,
  },
  {
    id: 'health-plus',
    name: 'Health Plus',
    description: 'Comprehensive outpatient and inpatient health cover.',
    category: 'Health',
    basePremium: 480,
  },
  {
    id: 'auto-comp',
    name: 'Auto Comprehensive',
    description: 'Full comprehensive motor insurance with roadside assist.',
    category: 'Auto',
    basePremium: 360,
  },
];

const POLICIES: ActivePolicy[] = [
  {
    id: 'pol-001',
    productName: 'Health Plus',
    policyNumber: 'NB-INS-2026-0001',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    premium: 480,
    status: 'Active',
  },
];

export const api = {
  async fetchProducts(): Promise<InsuranceProduct[]> {
    return PRODUCTS;
  },
  async fetchActivePolicies(): Promise<ActivePolicy[]> {
    return POLICIES;
  },
  async calculateCoverage(income: number, dependents: number): Promise<CoverageCalculation> {
    const recommendedCoverage = Math.max(0, income * 10 + dependents * 25000);
    return {
      recommendedCoverage,
      reasoning: 'Based on 10x annual income plus dependent protection buffer.',
    };
  },
  async getPremiumEstimate(productId: string, age: number, location: string): Promise<number> {
    const product = PRODUCTS.find((p) => p.id === productId) || PRODUCTS[0];
    const ageFactor = Math.max(0.8, age / 35);
    const locationFactor = location ? 1.05 : 1;
    return Math.round(product.basePremium * ageFactor * locationFactor);
  },
  async submitQuickQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const annual = await this.getPremiumEstimate(request.productId, request.age, request.location);
    return {
      quoteId: `Q-${Date.now()}`,
      monthlyPremium: Math.round((annual / 12) * 100) / 100,
      premiumEstimate: annual,
      validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    };
  },
};
