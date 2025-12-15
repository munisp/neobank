import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  CreditCard, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle,
  Plus,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const LoansPage = () => {
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLoans: 0,
    activeLoans: 0,
    totalBorrowed: 0,
    totalRepaid: 0,
    outstandingBalance: 0
  });

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      const response = await api.loans.list();
      setLoans(response.data);
      
      // Calculate stats
      const stats = response.data.reduce((acc, loan) => {
        acc.totalLoans++;
        if (loan.status === 'active' || loan.status === 'disbursed') {
          acc.activeLoans++;
          acc.outstandingBalance += parseFloat(loan.outstanding_balance || 0);
        }
        acc.totalBorrowed += parseFloat(loan.approved_amount || 0);
        acc.totalRepaid += parseFloat(loan.total_repaid || 0);
        return acc;
      }, {
        totalLoans: 0,
        activeLoans: 0,
        totalBorrowed: 0,
        totalRepaid: 0,
        outstandingBalance: 0
      });
      
      setStats(stats);
    } catch (error) {
      console.error('Error fetching loans:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { variant: 'secondary', label: 'Draft', icon: FileText },
      submitted: { variant: 'default', label: 'Under Review', icon: Clock },
      approved: { variant: 'success', label: 'Approved', icon: CheckCircle },
      rejected: { variant: 'destructive', label: 'Rejected', icon: XCircle },
      disbursed: { variant: 'success', label: 'Active', icon: TrendingUp },
      completed: { variant: 'outline', label: 'Completed', icon: CheckCircle },
      defaulted: { variant: 'destructive', label: 'Defaulted', icon: XCircle }
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getLoanTypeLabel = (type) => {
    const types = {
      personal: 'Personal Loan',
      business: 'Business Loan',
      mortgage: 'Mortgage',
      auto: 'Auto Loan',
      education: 'Education Loan',
      payday: 'Payday Loan'
    };
    return types[type] || type;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  const calculateProgress = (loan) => {
    if (!loan.approved_amount) return 0;
    const repaid = parseFloat(loan.total_repaid || 0);
    const total = parseFloat(loan.approved_amount);
    return (repaid / total) * 100;
  };

  const filterLoans = (status) => {
    if (status === 'all') return loans;
    if (status === 'active') {
      return loans.filter(l => l.status === 'disbursed' || l.status === 'active');
    }
    return loans.filter(l => l.status === status);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your loans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Loans</h1>
          <p className="text-muted-foreground">Manage your loan applications and repayments</p>
        </div>
        <Button onClick={() => navigate('/loans/apply')} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Apply for Loan
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLoans}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeLoans} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Borrowed</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalBorrowed)}</div>
            <p className="text-xs text-muted-foreground">
              Lifetime borrowing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Repaid</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRepaid)}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.totalRepaid / stats.totalBorrowed) * 100 || 0).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.outstandingBalance)}</div>
            <p className="text-xs text-muted-foreground">
              Across {stats.activeLoans} loans
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loans List */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Loans</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="submitted">Pending</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {['all', 'active', 'submitted', 'draft', 'completed'].map(tab => (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {filterLoans(tab).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No loans found</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    {tab === 'all' 
                      ? "You haven't applied for any loans yet."
                      : `You don't have any ${tab} loans.`}
                  </p>
                  {tab === 'all' && (
                    <Button onClick={() => navigate('/loans/apply')}>
                      Apply for Your First Loan
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              filterLoans(tab).map(loan => (
                <Card key={loan.id} className="hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => navigate(`/loans/${loan.id}`)}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {getLoanTypeLabel(loan.loan_type)}
                          {getStatusBadge(loan.status)}
                        </CardTitle>
                        <CardDescription>
                          Application ID: {loan.id.substring(0, 8)}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          {formatCurrency(loan.approved_amount || loan.requested_amount)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {loan.approved_amount ? 'Approved Amount' : 'Requested Amount'}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loan.status === 'disbursed' && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Repayment Progress</span>
                          <span className="font-medium">
                            {calculateProgress(loan).toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={calculateProgress(loan)} />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Repaid: {formatCurrency(loan.total_repaid || 0)}
                          </span>
                          <span className="text-muted-foreground">
                            Remaining: {formatCurrency(loan.outstanding_balance || 0)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Interest Rate</div>
                        <div className="font-medium">{loan.interest_rate}% p.a.</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Term</div>
                        <div className="font-medium">{loan.term_months} months</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Monthly Payment</div>
                        <div className="font-medium">
                          {formatCurrency(loan.monthly_payment || 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Applied Date</div>
                        <div className="font-medium">
                          {new Date(loan.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {loan.next_payment_date && (
                      <Alert>
                        <Calendar className="h-4 w-4" />
                        <AlertDescription>
                          Next payment of {formatCurrency(loan.monthly_payment)} due on{' '}
                          {new Date(loan.next_payment_date).toLocaleDateString()}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button variant="ghost" className="ml-auto">
                      View Details
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default LoansPage;
