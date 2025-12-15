import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, User, Video, CheckCircle, Shield, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-primary/10 to-background">
        <div className="container max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Secure Identity Verification
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Complete your KYC and KYB verification quickly and securely with NeoBank's
            advanced verification platform
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/kyc">
              <Button size="lg" className="w-full sm:w-auto">
                <User className="mr-2 h-5 w-5" />
                Start KYC Verification
              </Button>
            </Link>
            <Link href="/kyb">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <Building2 className="mr-2 h-5 w-5" />
                Start KYB Verification
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Verification Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <User className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>KYC Verification</CardTitle>
                <CardDescription>
                  Individual identity verification with multiple tiers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Basic, Enhanced, and Premium tiers</li>
                  <li>• Document verification</li>
                  <li>• Biometric authentication</li>
                  <li>• AML/PEP screening</li>
                </ul>
                <Link href="/kyc">
                  <Button className="w-full mt-4">Get Started</Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Building2 className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>KYB Verification</CardTitle>
                <CardDescription>
                  Business verification and compliance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• CAC registration verification</li>
                  <li>• UBO identification</li>
                  <li>• Financial information</li>
                  <li>• Risk assessment</li>
                </ul>
                <Link href="/kyb">
                  <Button className="w-full mt-4">Get Started</Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Video className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>Video KYC</CardTitle>
                <CardDescription>
                  Live agent verification sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Live video verification</li>
                  <li>• Real-time document check</li>
                  <li>• Scheduled sessions</li>
                  <li>• Session recordings</li>
                </ul>
                <Link href="/video-kyc/schedule">
                  <Button className="w-full mt-4">Schedule Session</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 bg-muted/50">
        <div className="container max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Choose NeoBank
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Secure & Compliant</h3>
              <p className="text-muted-foreground">
                Bank-grade security with full regulatory compliance
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Fast Processing</h3>
              <p className="text-muted-foreground">
                Quick verification with real-time status updates
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Easy to Use</h3>
              <p className="text-muted-foreground">
                Simple step-by-step process with clear guidance
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Get Verified?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Start your verification process today and unlock full platform access
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/kyc">
              <Button size="lg" className="w-full sm:w-auto">
                Start KYC Now
              </Button>
            </Link>
            <Link href="/kyb">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Start KYB Now
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
