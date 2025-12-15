import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  CreditCard, 
  TrendingUp, 
  Shield, 
  ArrowUpRight, 
  ArrowDownRight,
  Eye,
  EyeOff,
  Plus,
  Send
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Progress } from '@/components/ui/progress.jsx'
import { dashboardAPI, accountsAPI, transactionsAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const { user } = useAuth()

  // Mock data for demonstration (replace with real API calls)
  const mockData = {
    totalBalance: 2847650.00,
    accounts: [
      { id: '1', name: 'Savings Account', balance: 1500000.00, type: 'savings' },
      { id: '2', name: 'Current Account', balance: 1347650.00, type: 'current' }
    ],
    recentTransactions: [
      { id: '1', description: 'Salary Payment', amount: 850000, type: 'credit', date: '2025-10-07' },
      { id: '2', description: 'Grocery Shopping', amount: -45000, type: 'debit', date: '2025-10-06' },
      { id: '3', description: 'Transfer to John', amount: -100000, type: 'debit', date: '2025-10-05' },
      { id: '4', description: 'Refund', amount: 25000, type: 'credit', date: '2025-10-04' }
    ],
    monthlySpending: {
      total: 450000,
      categories: [
        { name: 'Food & Dining', amount: 120000, percentage: 27 },
        { name: 'Transportation', amount: 85000, percentage: 19 },
        { name: 'Shopping', amount: 95000, percentage: 21 },
        { name: 'Bills & Utilities', amount: 150000, percentage: 33 }
      ]
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatBalance = (amount) => {
    return balanceVisible ? formatCurrency(amount) : '₦****'
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Welcome back, {user?.name?.split(' ')[0] || 'User'}! 👋
            </h1>
            <p className="text-blue-100 text-lg">
              Here's your financial overview for today
            </p>
          </div>
          <div className="hidden md:block">
            <div className="text-right">
              <p className="text-blue-100 text-sm">Total Balance</p>
              <div className="flex items-center space-x-2">
                <p className="text-3xl font-bold">{formatBalance(mockData.totalBalance)}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBalanceVisible(!balanceVisible)}
                  className="text-white hover:bg-blue-700"
                >
                  {balanceVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/transfer">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-6 text-center">
              <Send className="h-8 w-8 text-blue-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-900">Send Money</p>
              <p className="text-sm text-gray-500">Transfer funds</p>
            </CardContent>
          </Card>
        </Link>
        
        <Link to="/accounts">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
            <CardContent className="p-6 text-center">
              <Plus className="h-8 w-8 text-green-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-900">New Account</p>
              <p className="text-sm text-gray-500">Open account</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/transactions">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200">
            <CardContent className="p-6 text-center">
              <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-900">Analytics</p>
              <p className="text-sm text-gray-500">View insights</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/kyc">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
            <CardContent className="p-6 text-center">
              <Shield className="h-8 w-8 text-orange-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-900">Verify ID</p>
              <p className="text-sm text-gray-500">Complete KYC</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Accounts Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your Accounts</span>
              <CreditCard className="h-5 w-5 text-gray-400" />
            </CardTitle>
            <CardDescription>Manage your banking accounts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockData.accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold text-gray-900">{account.name}</p>
                  <p className="text-sm text-gray-500 capitalize">{account.type} Account</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{formatBalance(account.balance)}</p>
                  <Badge variant={account.type === 'savings' ? 'default' : 'secondary'} className="text-xs">
                    {account.type}
                  </Badge>
                </div>
              </div>
            ))}
            <Link to="/accounts">
              <Button variant="outline" className="w-full">
                View All Accounts
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Your latest financial activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockData.recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${
                      transaction.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {transaction.type === 'credit' ? (
                        <ArrowDownRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{transaction.description}</p>
                      <p className="text-sm text-gray-500">{transaction.date}</p>
                    </div>
                  </div>
                  <p className={`font-semibold ${
                    transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.type === 'credit' ? '+' : ''}{formatCurrency(transaction.amount)}
                  </p>
                </div>
              ))}
            </div>
            <Link to="/transactions">
              <Button variant="outline" className="w-full mt-4">
                View All Transactions
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Spending Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Spending Analysis</CardTitle>
          <CardDescription>
            You've spent {formatCurrency(mockData.monthlySpending.total)} this month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {mockData.monthlySpending.categories.map((category, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{category.name}</span>
                  <span className="text-sm text-gray-500">{formatCurrency(category.amount)}</span>
                </div>
                <Progress value={category.percentage} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
