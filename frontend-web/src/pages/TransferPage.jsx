import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { ArrowRight, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export default function TransferPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [transfer, setTransfer] = useState({
    from_account: '',
    to_account: '',
    amount: '',
    description: '',
    transfer_type: 'internal'
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/accounts');
      setAccounts(response.data);
      if (response.data.length > 0) {
        setTransfer(prev => ({ ...prev, from_account: response.data[0].id }));
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const transferData = {
        amount: parseFloat(transfer.amount),
        transaction_type: 'transfer',
        description: transfer.description,
        destination_account_number: transfer.to_account
      };

      await api.post('/transactions', transferData);
      setSuccess(true);
      setTransfer({
        from_account: transfer.from_account,
        to_account: '',
        amount: '',
        description: '',
        transfer_type: 'internal'
      });
      
      // Refresh accounts to update balances
      fetchAccounts();
    } catch (error) {
      setError(error.response?.data?.detail || 'Transfer failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  const selectedAccount = accounts.find(acc => acc.id === transfer.from_account);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transfer Money</h1>
        <p className="text-gray-600 mt-2">Send money to other accounts quickly and securely</p>
      </div>

      {success && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Transfer completed successfully! The money has been sent.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Send className="w-5 h-5 mr-2" />
            Transfer Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTransfer} className="space-y-6">
            {/* From Account */}
            <div>
              <Label htmlFor="from_account">From Account</Label>
              <Select
                value={transfer.from_account}
                onValueChange={(value) => setTransfer({...transfer, from_account: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex justify-between items-center w-full">
                        <span>{account.account_name}</span>
                        <span className="text-sm text-gray-500 ml-4">
                          {formatCurrency(account.available_balance)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAccount && (
                <p className="text-sm text-gray-600 mt-1">
                  Available: {formatCurrency(selectedAccount.available_balance)}
                </p>
              )}
            </div>

            {/* Transfer Type */}
            <div>
              <Label htmlFor="transfer_type">Transfer Type</Label>
              <Select
                value={transfer.transfer_type}
                onValueChange={(value) => setTransfer({...transfer, transfer_type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal Transfer</SelectItem>
                  <SelectItem value="external">External Transfer</SelectItem>
                  <SelectItem value="international">International Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* To Account */}
            <div>
              <Label htmlFor="to_account">
                {transfer.transfer_type === 'internal' ? 'To Account Number' : 'Recipient Account'}
              </Label>
              <Input
                id="to_account"
                value={transfer.to_account}
                onChange={(e) => setTransfer({...transfer, to_account: e.target.value})}
                placeholder={transfer.transfer_type === 'internal' ? '9991234567' : 'Enter account number'}
                required
              />
              <p className="text-sm text-gray-600 mt-1">
                {transfer.transfer_type === 'internal' 
                  ? 'Enter the 10-digit NeoBank account number'
                  : 'Enter the recipient\'s account number'
                }
              </p>
            </div>

            {/* Amount */}
            <div>
              <Label htmlFor="amount">Amount (NGN)</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  value={transfer.amount}
                  onChange={(e) => setTransfer({...transfer, amount: e.target.value})}
                  placeholder="0.00"
                  min="1"
                  max={selectedAccount?.available_balance || 1000000}
                  step="0.01"
                  required
                  className="text-lg font-semibold"
                />
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 text-lg">₦</span>
                </div>
              </div>
              {transfer.amount && (
                <p className="text-sm text-gray-600 mt-1">
                  You're sending {formatCurrency(parseFloat(transfer.amount) || 0)}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={transfer.description}
                onChange={(e) => setTransfer({...transfer, description: e.target.value})}
                placeholder="What's this transfer for?"
                required
              />
            </div>

            {/* Transfer Summary */}
            {transfer.amount && transfer.to_account && (
              <Card className="bg-gray-50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Transfer Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">From:</span>
                      <span className="font-medium">
                        {selectedAccount?.account_name} ({selectedAccount?.account_number})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">To:</span>
                      <span className="font-medium">{transfer.to_account}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount:</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(parseFloat(transfer.amount) || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fee:</span>
                      <span className="font-medium text-green-600">Free</span>
                    </div>
                    <hr />
                    <div className="flex justify-between">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(parseFloat(transfer.amount) || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-4 pt-6">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setTransfer({
                  from_account: transfer.from_account,
                  to_account: '',
                  amount: '',
                  description: '',
                  transfer_type: 'internal'
                })}
              >
                Clear
              </Button>
              <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700"
                disabled={loading || !transfer.amount || !transfer.to_account || !transfer.description}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Send Money
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Quick Transfer Options */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Quick Transfer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1000, 5000, 10000, 25000].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                onClick={() => setTransfer({...transfer, amount: amount.toString()})}
                className="h-12"
              >
                {formatCurrency(amount)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
