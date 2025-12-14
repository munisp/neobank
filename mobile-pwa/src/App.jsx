import { useState } from 'react'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [darkMode, setDarkMode] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [buyQuantity, setBuyQuantity] = useState(1)
  const [orderType, setOrderType] = useState('market')
  const [showConfirmation, setShowConfirmation] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState('fiat') // 'fiat' or 'stablecoin'
    const [selectedStablecoin, setSelectedStablecoin] = useState('USDT')
    const [kycCountry, setKycCountry] = useState('NG')
    const [kycStep, setKycStep] = useState(1)

    const stablecoins = [
      { symbol: 'USDT', name: 'Tether USD', balance: 5000.00 },
      { symbol: 'USDC', name: 'USD Coin', balance: 3500.00 },
      { symbol: 'DAI', name: 'Dai Stablecoin', balance: 1200.00 },
      { symbol: 'BUSD', name: 'Binance USD', balance: 800.00 },
    ]

    const supportedCountries = [
      { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', docs: ['BVN', 'NIN', 'Passport'] },
      { code: 'ZA', name: 'South Africa', flag: '🇿🇦', currency: 'ZAR', docs: ['SA ID', 'Passport', 'CIPC'] },
      { code: 'KE', name: 'Kenya', flag: '🇰🇪', currency: 'KES', docs: ['National ID', 'KRA PIN', 'Passport'] },
      { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'GHS', docs: ['Ghana Card', 'GRA TIN', 'Passport'] },
      { code: 'EG', name: 'Egypt', flag: '🇪🇬', currency: 'EGP', docs: ['National ID', 'Passport'] },
      { code: 'MA', name: 'Morocco', flag: '🇲🇦', currency: 'MAD', docs: ['CNIE', 'OMPIC', 'Passport'] },
      { code: 'UG', name: 'Uganda', flag: '🇺🇬', currency: 'UGX', docs: ['NIN', 'URSB', 'Passport'] },
      { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', currency: 'TZS', docs: ['NIDA', 'BRELA', 'Passport'] },
      { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', currency: 'ZWL', docs: ['National ID', 'Passport'] },
      { code: 'BW', name: 'Botswana', flag: '🇧🇼', currency: 'BWP', docs: ['Omang', 'CIPA', 'Passport'] },
      { code: 'ZM', name: 'Zambia', flag: '🇿🇲', currency: 'ZMW', docs: ['NRC', 'PACRA', 'Passport'] },
    ]

    const stocksData = [
    { name: 'NGX (Nigeria)', symbol: 'DANGCEM', price: 285.50, currency: '₦', change: '+2.3%', exchange: 'NGX', company: 'Dangote Cement PLC', sector: 'Materials', marketCap: '₦4.8T' },
    { name: 'JSE (South Africa)', symbol: 'NPN', price: 2450, currency: 'R', change: '+1.8%', exchange: 'JSE', company: 'Naspers Limited', sector: 'Technology', marketCap: 'R890B' },
    { name: 'NSE (Kenya)', symbol: 'SCOM', price: 38.50, currency: 'KES', change: '-0.5%', exchange: 'NSE', company: 'Safaricom PLC', sector: 'Telecom', marketCap: 'KES 1.5T' },
    { name: 'GSE (Ghana)', symbol: 'MTNGH', price: 1.25, currency: 'GHS', change: '+3.2%', exchange: 'GSE', company: 'MTN Ghana', sector: 'Telecom', marketCap: 'GHS 15.8B' },
    { name: 'EGX (Egypt)', symbol: 'COMI', price: 52.30, currency: 'EGP', change: '+1.1%', exchange: 'EGX', company: 'Commercial International Bank', sector: 'Financials', marketCap: 'EGP 156B' },
  ]

  const handleBuyClick = (stock) => {
    setSelectedStock(stock)
    setBuyQuantity(1)
    setOrderType('market')
    setShowBuyModal(true)
  }

  const handleConfirmOrder = () => {
    setShowBuyModal(false)
    setShowConfirmation(true)
  }

  const handlePlaceOrder = () => {
    setShowConfirmation(false)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3000)
  }

  const features = {
    dashboard: {
      title: 'Dashboard',
      icon: '🏠',
      content: (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-xl">
            <p className="text-sm opacity-80">Total Balance</p>
            <h2 className="text-3xl font-bold">₦2,450,000.00</h2>
            <p className="text-sm mt-2">+12.5% from last month</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-500 text-sm">Savings</p>
              <p className="text-xl font-semibold">₦850,000</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-500 text-sm">Investments</p>
              <p className="text-xl font-semibold">₦1,200,000</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-3">Quick Actions</h3>
            <div className="grid grid-cols-4 gap-2">
              {['Send', 'Request', 'Pay Bills', 'Top Up'].map((action, i) => (
                <button key={i} className="flex flex-col items-center p-2 bg-gray-50 rounded-lg hover:bg-gray-100">
                  <span className="text-2xl">{['💸', '📥', '📄', '📱'][i]}</span>
                  <span className="text-xs mt-1">{action}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-3">Recent Transactions</h3>
            <div className="space-y-3">
              {[
                { name: 'Netflix Subscription', amount: '-₦4,500', type: 'debit' },
                { name: 'Salary Credit', amount: '+₦450,000', type: 'credit' },
                { name: 'Uber Ride', amount: '-₦2,300', type: 'debit' },
              ].map((tx, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm">{tx.name}</span>
                  <span className={`font-medium ${tx.type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>{tx.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
        investments: {
          title: 'Investments',
          icon: '📈',
          content: (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-4 rounded-xl">
                <p className="text-sm opacity-80">Buying Power</p>
                <h2 className="text-2xl font-bold">₦1,500,000.00</h2>
                <p className="text-sm mt-1">Available for trading</p>
              </div>

              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="font-semibold mb-2">Stablecoin Balances</h4>
                <p className="text-xs text-gray-500 mb-2">Use stablecoins to buy stocks from any exchange</p>
                <div className="grid grid-cols-2 gap-2">
                  {stablecoins.map((coin) => (
                    <div key={coin.symbol} className="bg-gray-50 p-2 rounded-lg">
                      <p className="text-xs text-gray-500">{coin.symbol}</p>
                      <p className="font-semibold">${coin.balance.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              <h3 className="font-semibold text-lg">African Stock Exchanges</h3>
              <p className="text-sm text-gray-500">Tap on a stock to buy with fiat or stablecoins</p>
          <div className="space-y-2">
            {stocksData.map((stock, i) => (
              <div 
                key={i} 
                className="bg-white p-4 rounded-lg shadow flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => handleBuyClick(stock)}
              >
                <div>
                  <p className="font-medium">{stock.symbol}</p>
                  <p className="text-sm text-gray-500">{stock.name}</p>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-semibold">{stock.currency}{stock.price.toLocaleString()}</p>
                    <p className={stock.change.startsWith('+') ? 'text-green-500 text-sm' : 'text-red-500 text-sm'}>{stock.change}</p>
                  </div>
                  <button className="bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-green-600">
                    Buy
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <h4 className="font-semibold">Commodities</h4>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-yellow-50 p-3 rounded-lg cursor-pointer hover:bg-yellow-100">
                <p className="text-sm">Gold</p>
                <p className="font-semibold">$2,024/oz</p>
                <button className="mt-2 bg-yellow-500 text-white px-2 py-1 rounded text-xs w-full">Buy Gold</button>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg cursor-pointer hover:bg-gray-100">
                <p className="text-sm">Silver</p>
                <p className="font-semibold">$23.45/oz</p>
                <button className="mt-2 bg-gray-500 text-white px-2 py-1 rounded text-xs w-full">Buy Silver</button>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Your Portfolio</h4>
            <p className="text-2xl font-bold text-green-600">₦1,245,000</p>
            <p className="text-sm text-gray-500">+15.3% all time</p>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>DANGCEM (50 shares)</span>
                <span className="text-green-500">+₦14,275</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>NPN (10 shares)</span>
                <span className="text-green-500">+R4,500</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    savings: {
      title: 'Savings',
      icon: '🏦',
      content: (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Savings Vaults</h3>
          <div className="space-y-3">
            {[
              { name: 'Emergency Fund', target: '₦500,000', current: '₦350,000', progress: 70 },
              { name: 'House Down Payment', target: '₦5,000,000', current: '₦1,200,000', progress: 24 },
              { name: 'Vacation Fund', target: '₦200,000', current: '₦180,000', progress: 90 },
            ].map((vault, i) => (
              <div key={i} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between mb-2">
                  <p className="font-medium">{vault.name}</p>
                  <p className="text-sm text-gray-500">{vault.current} / {vault.target}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${vault.progress}%` }}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-purple-50 p-4 rounded-lg">
            <h4 className="font-semibold">Group Savings (Ajo/Esusu/Stokvel)</h4>
            <p className="text-sm text-gray-600 mt-1">Join rotating savings groups with friends and family</p>
            <button className="mt-2 bg-purple-500 text-white px-4 py-2 rounded-lg text-sm">Create Group</button>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="font-semibold">Salary Advance</h4>
            <p className="text-sm text-gray-600 mt-1">Get up to 50% of your salary early</p>
            <p className="text-xs text-gray-500 mt-1">Available: ₦225,000</p>
          </div>
        </div>
      )
    },
    bnpl: {
      title: 'BNPL',
      icon: '🛒',
      content: (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-green-400 to-blue-500 text-white p-4 rounded-xl">
            <p className="text-sm opacity-80">Available Credit</p>
            <h2 className="text-2xl font-bold">₦500,000</h2>
          </div>
          <h3 className="font-semibold">Payment Plans</h3>
          <div className="grid grid-cols-2 gap-3">
            {['Pay in 3', 'Pay in 4', 'Pay in 6', 'Pay in 12'].map((plan, i) => (
              <div key={i} className="bg-white p-3 rounded-lg shadow text-center">
                <p className="font-medium">{plan}</p>
                <p className="text-xs text-gray-500">0% interest</p>
              </div>
            ))}
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Active Orders</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>iPhone 15 Pro</span>
                <span>₦150,000 (2/4 paid)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>MacBook Air</span>
                <span>₦450,000 (1/6 paid)</span>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Partner Merchants</h4>
            <div className="flex gap-2 flex-wrap">
              {['Jumia', 'Konga', 'Slot', 'Apple'].map((m, i) => (
                <span key={i} className="bg-gray-100 px-3 py-1 rounded-full text-sm">{m}</span>
              ))}
            </div>
          </div>
        </div>
      )
    },
    telecom: {
      title: 'Telecom',
      icon: '📱',
      content: (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Buy Airtime</h3>
          <div className="grid grid-cols-4 gap-2">
            {['MTN', 'Airtel', 'Glo', '9mobile'].map((network, i) => (
              <div key={i} className="bg-white p-3 rounded-lg shadow text-center cursor-pointer hover:bg-gray-50">
                <p className="text-sm font-medium">{network}</p>
              </div>
            ))}
          </div>
          <h3 className="font-semibold text-lg mt-4">Data Plans</h3>
          <div className="space-y-2">
            {[
              { data: '1GB', validity: '1 Day', price: '₦350' },
              { data: '3GB', validity: '7 Days', price: '₦1,000' },
              { data: '10GB', validity: '30 Days', price: '₦3,000' },
              { data: '25GB', validity: '30 Days', price: '₦6,000' },
            ].map((plan, i) => (
              <div key={i} className="bg-white p-3 rounded-lg shadow flex justify-between items-center">
                <div>
                  <p className="font-medium">{plan.data}</p>
                  <p className="text-xs text-gray-500">{plan.validity}</p>
                </div>
                <button className="bg-blue-500 text-white px-3 py-1 rounded text-sm">{plan.price}</button>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 p-4 rounded-lg mt-4">
            <h4 className="font-semibold">eSIM Plans</h4>
            <p className="text-sm text-gray-600">Get data for travel across Africa, Europe & Global</p>
            <div className="flex gap-2 mt-2">
              {['Africa', 'Europe', 'Global'].map((r, i) => (
                <span key={i} className="bg-blue-100 px-2 py-1 rounded text-xs">{r}</span>
              ))}
            </div>
          </div>
        </div>
      )
    },
    rewards: {
      title: 'Rewards',
      icon: '🎁',
      content: (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-xl">
            <p className="text-sm opacity-80">Your Points</p>
            <h2 className="text-2xl font-bold">12,450 pts</h2>
            <p className="text-sm mt-1">Worth ₦12,450</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-lg shadow">
              <p className="text-sm text-gray-500">Cashback Earned</p>
              <p className="font-semibold">₦45,200</p>
            </div>
            <div className="bg-white p-3 rounded-lg shadow">
              <p className="text-sm text-gray-500">Referrals</p>
              <p className="font-semibold">8 friends</p>
            </div>
          </div>
          <h3 className="font-semibold">Partner Offers</h3>
          <div className="space-y-2">
            {[
              { partner: 'Jumia', offer: '10% cashback' },
              { partner: 'Uber', offer: '₦500 off rides' },
              { partner: 'Netflix', offer: '1 month free' },
              { partner: 'Bolt', offer: '20% off first 5 rides' },
            ].map((offer, i) => (
              <div key={i} className="bg-white p-3 rounded-lg shadow flex justify-between items-center">
                <p className="font-medium">{offer.partner}</p>
                <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">{offer.offer}</span>
              </div>
            ))}
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="font-semibold">Membership Tiers</h4>
            <div className="flex gap-2 mt-2">
              {['Standard', 'Plus', 'Premium', 'Metal', 'Ultra'].map((t, i) => (
                <span key={i} className={`px-2 py-1 rounded text-xs ${i === 2 ? 'bg-purple-500 text-white' : 'bg-gray-200'}`}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )
    },
    insurance: {
      title: 'Insurance',
      icon: '🛡️',
      content: (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Insurance Products</h3>
          <div className="space-y-3">
            {[
              { type: 'Travel Insurance', desc: 'Medical & trip protection', price: 'From ₦5,000', icon: '✈️' },
              { type: 'Device Insurance', desc: 'Phone & gadget coverage', price: 'From ₦2,000/mo', icon: '📱' },
              { type: 'Life Insurance', desc: 'Family protection', price: 'From ₦10,000/mo', icon: '👨‍👩‍👧' },
              { type: 'Car Insurance', desc: 'Vehicle coverage', price: 'From ₦25,000/yr', icon: '🚗' },
            ].map((product, i) => (
              <div key={i} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <span className="text-2xl">{product.icon}</span>
                    <div>
                      <p className="font-medium">{product.type}</p>
                      <p className="text-sm text-gray-500">{product.desc}</p>
                    </div>
                  </div>
                  <p className="text-blue-500 font-medium text-sm">{product.price}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold">Your Policies</h4>
            <p className="text-sm text-gray-600 mt-1">You have 2 active policies</p>
            <div className="mt-2 space-y-1">
              <p className="text-xs">- Travel Insurance (Active)</p>
              <p className="text-xs">- Device Insurance (Active)</p>
            </div>
          </div>
        </div>
      )
    },
      accounts: {
        title: 'Accounts',
        icon: '👨‍👩‍👧',
        content: (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Account Types</h3>
            <div className="space-y-3">
              <div className="bg-pink-50 p-4 rounded-lg">
                <h4 className="font-semibold">Kids Account</h4>
                <p className="text-sm text-gray-600 mt-1">Teach your children financial literacy</p>
                <ul className="text-xs text-gray-500 mt-2 space-y-1">
                  <li>- Spending controls</li>
                  <li>- Task-based rewards</li>
                  <li>- Category restrictions</li>
                </ul>
                <button className="mt-2 bg-pink-500 text-white px-4 py-2 rounded-lg text-sm">Create Kids Account</button>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold">Joint Account</h4>
                <p className="text-sm text-gray-600 mt-1">Share finances with your partner</p>
                <ul className="text-xs text-gray-500 mt-2 space-y-1">
                  <li>- Multi-owner support</li>
                  <li>- Shared budgets</li>
                  <li>- Transaction visibility</li>
                </ul>
                <button className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">Create Joint Account</button>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <h4 className="font-semibold mb-2">Your Accounts</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Main Account</span>
                  <span className="font-medium">₦2,450,000</span>
                </div>
                <div className="flex justify-between">
                  <span>Savings Account</span>
                  <span className="font-medium">₦850,000</span>
                </div>
              </div>
            </div>
          </div>
        )
      },
      kyc: {
        title: 'KYC',
        icon: '🪪',
        content: (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-xl">
              <p className="text-sm opacity-80">Verification Status</p>
              <h2 className="text-xl font-bold">Tier 2 - Enhanced</h2>
              <p className="text-sm mt-1">Upgrade to Tier 3 for unlimited transactions</p>
            </div>

            <h3 className="font-semibold text-lg">Select Your Country</h3>
            <div className="grid grid-cols-3 gap-2">
              {supportedCountries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => setKycCountry(country.code)}
                  className={`p-3 rounded-lg border-2 text-center ${
                    kycCountry === country.code ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                  }`}
                >
                  <span className="text-2xl">{country.flag}</span>
                  <p className="text-xs mt-1">{country.name}</p>
                </button>
              ))}
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h4 className="font-semibold mb-3">Required Documents for {supportedCountries.find(c => c.code === kycCountry)?.name}</h4>
              <div className="space-y-2">
                {supportedCountries.find(c => c.code === kycCountry)?.docs.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <span className="text-sm font-medium">{doc}</span>
                    </div>
                    <button className="bg-indigo-500 text-white px-3 py-1 rounded text-xs">Upload</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h4 className="font-semibold mb-3">Verification Steps</h4>
              <div className="space-y-3">
                {[
                  { step: 1, title: 'Personal Information', status: 'completed' },
                  { step: 2, title: 'Document Upload', status: 'completed' },
                  { step: 3, title: 'Biometric Verification', status: 'current' },
                  { step: 4, title: 'AML Screening', status: 'pending' },
                  { step: 5, title: 'Final Review', status: 'pending' },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      item.status === 'completed' ? 'bg-green-500 text-white' :
                      item.status === 'current' ? 'bg-indigo-500 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {item.status === 'completed' ? '✓' : item.step}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.status === 'current' ? 'text-indigo-600' : ''}`}>{item.title}</p>
                    </div>
                    {item.status === 'current' && (
                      <button className="bg-indigo-500 text-white px-3 py-1 rounded text-xs">Continue</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <h4 className="font-semibold">Country-Specific Verification</h4>
              <p className="text-sm text-gray-600 mt-1">
                {kycCountry === 'NG' && 'Nigeria: BVN and NIN verification via NIBSS'}
                {kycCountry === 'ZA' && 'South Africa: SA ID verification via Home Affairs'}
                {kycCountry === 'KE' && 'Kenya: National ID via IPRS, KRA PIN verification'}
                {kycCountry === 'GH' && 'Ghana: Ghana Card via NIA, GRA TIN verification'}
                {kycCountry === 'EG' && 'Egypt: National ID via NIA'}
                {kycCountry === 'MA' && 'Morocco: CNIE verification, OMPIC for business'}
                {kycCountry === 'UG' && 'Uganda: NIN verification via NIRA'}
                {kycCountry === 'TZ' && 'Tanzania: NIDA verification'}
                {kycCountry === 'ZW' && 'Zimbabwe: National ID verification'}
                {kycCountry === 'BW' && 'Botswana: Omang verification'}
                {kycCountry === 'ZM' && 'Zambia: NRC verification'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h4 className="font-semibold mb-2">Verification Tiers</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                  <span className="text-sm">Tier 1 - Basic</span>
                  <span className="text-xs text-green-600">Completed</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                  <span className="text-sm">Tier 2 - Enhanced</span>
                  <span className="text-xs text-green-600">Current</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm">Tier 3 - Premium</span>
                  <span className="text-xs text-gray-500">Upgrade</span>
                </div>
              </div>
            </div>
          </div>
        )
      },
    escrow: {
      title: 'Escrow',
      icon: '🔒',
      content: (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-xl">
            <p className="text-sm opacity-80">Protected Transactions</p>
            <h2 className="text-2xl font-bold">₦3,250,000</h2>
            <p className="text-sm mt-1">5 Active Escrows</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="bg-white p-4 rounded-lg shadow text-center hover:bg-gray-50">
              <span className="text-2xl">🛒</span>
              <p className="text-sm font-medium mt-1">P2P Trade</p>
              <p className="text-xs text-gray-500">Buy/Sell safely</p>
            </button>
            <button className="bg-white p-4 rounded-lg shadow text-center hover:bg-gray-50">
              <span className="text-2xl">🏠</span>
              <p className="text-sm font-medium mt-1">Real Estate</p>
              <p className="text-xs text-gray-500">Property deals</p>
            </button>
            <button className="bg-white p-4 rounded-lg shadow text-center hover:bg-gray-50">
              <span className="text-2xl">🚗</span>
              <p className="text-sm font-medium mt-1">Vehicle</p>
              <p className="text-xs text-gray-500">Car transactions</p>
            </button>
            <button className="bg-white p-4 rounded-lg shadow text-center hover:bg-gray-50">
              <span className="text-2xl">💼</span>
              <p className="text-sm font-medium mt-1">Freelance</p>
              <p className="text-xs text-gray-500">Milestone payments</p>
            </button>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-3">Active Escrows</h4>
            <div className="space-y-3">
              {[
                { id: 'ESC-A1B2C3', title: 'iPhone 15 Pro Max', amount: '₦850,000', status: 'funded', type: 'P2P', role: 'Buyer', counterparty: 'John D.' },
                { id: 'ESC-D4E5F6', title: 'Web Development Project', amount: '₦1,200,000', status: 'in_progress', type: 'Milestone', role: 'Buyer', counterparty: 'DevStudio' },
                { id: 'ESC-G7H8I9', title: 'Toyota Camry 2020', amount: '₦8,500,000', status: 'inspection', type: 'Vehicle', role: 'Buyer', counterparty: 'AutoDealer' },
              ].map((escrow, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{escrow.title}</p>
                      <p className="text-xs text-gray-500">{escrow.id} - {escrow.type}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      escrow.status === 'funded' ? 'bg-blue-100 text-blue-600' :
                      escrow.status === 'in_progress' ? 'bg-yellow-100 text-yellow-600' :
                      escrow.status === 'inspection' ? 'bg-purple-100 text-purple-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {escrow.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-500">{escrow.role} - {escrow.counterparty}</p>
                    </div>
                    <p className="font-semibold text-green-600">{escrow.amount}</p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {escrow.status === 'inspection' && (
                      <>
                        <button className="flex-1 bg-green-500 text-white py-1 rounded text-xs">Approve</button>
                        <button className="flex-1 bg-red-500 text-white py-1 rounded text-xs">Dispute</button>
                      </>
                    )}
                    {escrow.status === 'funded' && (
                      <button className="flex-1 bg-blue-500 text-white py-1 rounded text-xs">View Details</button>
                    )}
                    {escrow.status === 'in_progress' && (
                      <button className="flex-1 bg-yellow-500 text-white py-1 rounded text-xs">Track Progress</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-3">Create New Escrow</h4>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500">Transaction Type</label>
                <select className="w-full p-2 border rounded-lg mt-1">
                  <option>P2P Marketplace</option>
                  <option>Real Estate</option>
                  <option>Vehicle Sale</option>
                  <option>Freelance/Service</option>
                  <option>Milestone Project</option>
                  <option>General Trade</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-500">Amount</label>
                <input type="text" placeholder="Enter amount" className="w-full p-2 border rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-500">Counterparty Email/Phone</label>
                <input type="text" placeholder="Enter email or phone" className="w-full p-2 border rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-500">Description</label>
                <textarea placeholder="Describe the transaction" className="w-full p-2 border rounded-lg mt-1" rows="2"></textarea>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="insurance" className="rounded" />
                <label htmlFor="insurance" className="text-sm">Add transaction insurance (+1%)</label>
              </div>
              <button className="w-full bg-indigo-500 text-white py-3 rounded-lg font-medium">
                Create Escrow
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Escrow Stats</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Completed</p>
                <p className="text-xl font-bold text-green-600">23</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Active</p>
                <p className="text-xl font-bold text-blue-600">5</p>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Disputed</p>
                <p className="text-xl font-bold text-yellow-600">1</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Total Volume</p>
                <p className="text-xl font-bold text-purple-600">₦45M</p>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 p-4 rounded-lg">
            <h4 className="font-semibold">How Escrow Works</h4>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs">1</span>
                <p className="text-sm">Buyer and seller agree on terms</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs">2</span>
                <p className="text-sm">Buyer funds the escrow</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs">3</span>
                <p className="text-sm">Seller delivers goods/services</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs">4</span>
                <p className="text-sm">Buyer inspects and approves</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs">5</span>
                <p className="text-sm">Funds released to seller</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Dispute Resolution</h4>
            <p className="text-sm text-gray-600">Our arbitration team resolves disputes within 48-72 hours with evidence-based decisions.</p>
            <div className="mt-2 flex gap-2">
              <span className="text-xs bg-gray-100 px-2 py-1 rounded">Evidence Upload</span>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded">Mediation</span>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded">Fair Split</span>
            </div>
          </div>
        </div>
      )
    },
    }

  const tabs = Object.keys(features)

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>
      {/* Header */}
      <header className={`${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm p-4 sticky top-0 z-10`}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-blue-600">NeoBank</h1>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>African Digital Banking</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-full bg-gray-100 relative">
              <span>🔔</span>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">3</span>
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full bg-gray-100"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 pb-24">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          {features[activeTab].icon} {features[activeTab].title}
        </h2>
        {features[activeTab].content}
      </main>

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 right-0 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg border-t z-10`}>
        <div className="flex justify-around py-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center p-2 min-w-[60px] transition-colors ${
                activeTab === tab ? 'text-blue-500' : darkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              <span className="text-xl">{features[tab].icon}</span>
              <span className="text-xs mt-1">{features[tab].title}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Buy Stock Modal - Step 1: Stock Details & Order Form */}
      {showBuyModal && selectedStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-slide-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Buy {selectedStock.symbol}</h3>
              <button onClick={() => setShowBuyModal(false)} className="text-gray-500 text-2xl">&times;</button>
            </div>
            
            {/* Stock Info */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">{selectedStock.company}</p>
                  <p className="text-sm text-gray-500">{selectedStock.exchange} - {selectedStock.sector}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{selectedStock.currency}{selectedStock.price.toLocaleString()}</p>
                  <p className={selectedStock.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}>{selectedStock.change}</p>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                Market Cap: {selectedStock.marketCap}
              </div>
            </div>

                        {/* Payment Method */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium mb-2">Payment Method</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => setPaymentMethod('fiat')}
                              className={`p-3 rounded-lg border-2 ${paymentMethod === 'fiat' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                            >
                              <p className="font-medium">Fiat Currency</p>
                              <p className="text-xs text-gray-500">{selectedStock.currency} Balance</p>
                            </button>
                            <button 
                              onClick={() => setPaymentMethod('stablecoin')}
                              className={`p-3 rounded-lg border-2 ${paymentMethod === 'stablecoin' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                            >
                              <p className="font-medium">Stablecoin</p>
                              <p className="text-xs text-gray-500">USDT/USDC/DAI</p>
                            </button>
                          </div>
                        </div>

                        {/* Stablecoin Selection */}
                        {paymentMethod === 'stablecoin' && (
                          <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Select Stablecoin</label>
                            <div className="grid grid-cols-4 gap-2">
                              {stablecoins.map((coin) => (
                                <button
                                  key={coin.symbol}
                                  onClick={() => setSelectedStablecoin(coin.symbol)}
                                  className={`p-2 rounded-lg border-2 text-center ${
                                    selectedStablecoin === coin.symbol ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                  }`}
                                >
                                  <p className="text-xs font-medium">{coin.symbol}</p>
                                  <p className="text-xs text-gray-500">${coin.balance.toLocaleString()}</p>
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Auto-converts to {selectedStock.currency} at current FX rate</p>
                          </div>
                        )}

                        {/* Order Type */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium mb-2">Order Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => setOrderType('market')}
                              className={`p-3 rounded-lg border-2 ${orderType === 'market' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
                            >
                              <p className="font-medium">Market Order</p>
                              <p className="text-xs text-gray-500">Execute immediately</p>
                            </button>
                            <button 
                              onClick={() => setOrderType('limit')}
                              className={`p-3 rounded-lg border-2 ${orderType === 'limit' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
                            >
                              <p className="font-medium">Limit Order</p>
                              <p className="text-xs text-gray-500">Set your price</p>
                            </button>
                          </div>
                        </div>

            {/* Quantity */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Number of Shares</label>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setBuyQuantity(Math.max(1, buyQuantity - 1))}
                  className="w-12 h-12 rounded-full bg-gray-100 text-xl font-bold"
                >-</button>
                <input 
                  type="number" 
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 text-center text-2xl font-bold border-b-2 border-gray-300 focus:border-green-500 outline-none"
                />
                <button 
                  onClick={() => setBuyQuantity(buyQuantity + 1)}
                  className="w-12 h-12 rounded-full bg-gray-100 text-xl font-bold"
                >+</button>
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-green-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Price per share</span>
                <span>{selectedStock.currency}{selectedStock.price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Quantity</span>
                <span>{buyQuantity} shares</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Commission (0.5%)</span>
                <span>{selectedStock.currency}{(selectedStock.price * buyQuantity * 0.005).toLocaleString()}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{selectedStock.currency}{(selectedStock.price * buyQuantity * 1.005).toLocaleString()}</span>
              </div>
            </div>

            <button 
              onClick={handleConfirmOrder}
              className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-600 transition-colors"
            >
              Review Order
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Step 2: Review & Confirm */}
      {showConfirmation && selectedStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📈</span>
              </div>
              <h3 className="text-xl font-bold">Confirm Your Order</h3>
              <p className="text-gray-500 mt-1">Please review your order details</p>
            </div>

                        <div className="space-y-3 mb-6">
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Stock</span>
                            <span className="font-medium">{selectedStock.symbol} ({selectedStock.exchange})</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Payment Method</span>
                            <span className="font-medium">{paymentMethod === 'stablecoin' ? selectedStablecoin : selectedStock.currency}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Order Type</span>
                            <span className="font-medium capitalize">{orderType}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Quantity</span>
                            <span className="font-medium">{buyQuantity} shares</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Price</span>
                            <span className="font-medium">{selectedStock.currency}{selectedStock.price.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Commission</span>
                            <span className="font-medium">{selectedStock.currency}{(selectedStock.price * buyQuantity * 0.005).toLocaleString()}</span>
                          </div>
                          {paymentMethod === 'stablecoin' && (
                            <div className="flex justify-between py-2 border-b bg-blue-50 px-2 rounded">
                              <span className="text-gray-600">FX Conversion</span>
                              <span className="font-medium text-blue-600">{selectedStablecoin} to {selectedStock.currency}</span>
                            </div>
                          )}
                          <div className="flex justify-between py-3 bg-green-50 rounded-lg px-3">
                            <span className="font-bold">Total Amount</span>
                            <span className="font-bold text-green-600">{selectedStock.currency}{(selectedStock.price * buyQuantity * 1.005).toLocaleString()}</span>
                          </div>
                        </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmation(false)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handlePlaceOrder}
                className="flex-1 py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600"
              >
                Place Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal - Step 3: Order Placed */}
      {showSuccess && selectedStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 text-center">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl text-white">✓</span>
            </div>
            <h3 className="text-2xl font-bold text-green-600 mb-2">Order Placed!</h3>
            <p className="text-gray-600 mb-4">
              Your order to buy {buyQuantity} shares of {selectedStock.symbol} has been submitted successfully.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-gray-500">Order ID</p>
              <p className="font-mono font-bold">ORD-{Date.now().toString(36).toUpperCase()}</p>
            </div>
            <p className="text-sm text-gray-500">
              You will receive a notification once your order is executed.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
