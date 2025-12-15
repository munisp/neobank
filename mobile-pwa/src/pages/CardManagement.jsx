import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import NotificationService from '../services/NotificationService';

// Mock UI Components - In a real app, these would be imported from '../components/ui/'
const Button = ({ children, onClick, className = '', disabled = false }) => (
  <button onClick={onClick} className={`p-3 rounded-lg font-semibold transition-colors ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={disabled}>
    {children}
  </button>
);
const Card = ({ children, className = '' }) => <div className={`bg-white shadow-lg rounded-xl p-4 ${className}`}>{children}</div>;
const Spinner = () => <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>;
const Alert = ({ type, message }) => (
  <div className={`p-4 rounded-lg text-sm ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
    {message}
  </div>
);
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="relative bg-white rounded-xl shadow-xl w-11/12 md:w-1/3 p-6">
        <h3 className="text-xl font-bold mb-4">{title}</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
        {children}
      </div>
    </div>
  );
};
const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  if (isOnline) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-yellow-500 text-white text-center p-2 text-sm z-40">
      You are currently offline. Some features may be unavailable.
    </div>
  );
};

// Mock Context for demonstration (assuming a global context for user/app state)
const AppContext = React.createContext({ isUserLoggedIn: true });
const useAppContext = () => useContext(AppContext);


const CardManagement = () => {
  const navigate = useNavigate();
  const { isUserLoggedIn } = useAppContext(); // Example of using context

  // State for data fetching and status
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  // State for UI interactions
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'freeze', 'new_card', 'details'

  // --- Data Fetching Effect ---
  useEffect(() => {
    if (!isUserLoggedIn) {
      // Redirect to login if not authenticated
      navigate('/login');
      return;
    }

    const fetchCardData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Simulate API calls
        const cardResponse = await ApiService.get('/cards');
        const transactionResponse = await ApiService.get('/transactions');

        setCards(cardResponse.data.cards || []);
        setTransactions(transactionResponse.data.transactions || []);
      } catch (err) {
        console.error('Failed to fetch card data:', err);
        setError('Failed to load card information. Please try again.');
        NotificationService.error('Error loading data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCardData();
  }, [isUserLoggedIn, navigate]);

  // --- Event Handlers ---

  const handleFreezeUnfreeze = async (cardId, isFrozen) => {
    // Logic to freeze/unfreeze a card
    const action = isFrozen ? 'unfreeze' : 'freeze';
    NotificationService.info(`Attempting to ${action} card...`);
    try {
      // Simulate API call
      await ApiService.post(`/cards/${cardId}/${action}`);
      
      // Update local state
      setCards(prevCards => 
        prevCards.map(card => 
          card.id === cardId ? { ...card, isFrozen: !isFrozen } : card
        )
      );
      NotificationService.success(`Card successfully ${action}d.`);
    } catch (err) {
      setError(`Failed to ${action} card.`);
      NotificationService.error(`Failed to ${action} card.`);
    }
  };

  const handleRequestNewCard = () => {
    setModalType('new_card');
    setIsModalOpen(true);
  };

  const handleViewDetails = (card) => {
    setSelectedCard(card);
    setModalType('details');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalType(null);
    setSelectedCard(null);
  };

  // --- Render Helpers ---

  const renderCardList = () => {
    if (isLoading) {
      return <Spinner />;
    }

    if (error) {
      return <Alert type="error" message={error} />;
    }

    if (cards.length === 0) {
      return (
        <div className="text-center p-10 bg-gray-50 rounded-xl">
          <p className="text-gray-500 mb-4">You don't have any active cards.</p>
          <Button onClick={handleRequestNewCard} className="bg-blue-500 text-white hover:bg-blue-600">
            Request New Card
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {cards.map(card => (
          <Card key={card.id} className={`flex justify-between items-center ${card.isFrozen ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500'}`}>
            <div>
              <p className="font-bold text-lg">{card.name}</p>
              <p className="text-sm text-gray-500">**** **** **** {card.last4}</p>
              <p className={`text-xs font-semibold ${card.isFrozen ? 'text-red-500' : 'text-green-500'}`}>
                {card.isFrozen ? 'FROZEN' : 'ACTIVE'}
              </p>
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={() => handleFreezeUnfreeze(card.id, card.isFrozen)} 
                className={`text-white text-sm px-3 py-1 ${card.isFrozen ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {card.isFrozen ? 'Unfreeze' : 'Freeze'}
              </Button>
              <Button 
                onClick={() => handleViewDetails(card)} 
                className="bg-gray-200 text-gray-800 hover:bg-gray-300 text-sm px-3 py-1"
              >
                Details
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderModalContent = () => {
    switch (modalType) {
      case 'new_card':
        return (
          <form onSubmit={(e) => { e.preventDefault(); /* Handle new card request logic */ handleCloseModal(); NotificationService.success('New card request submitted!'); }}>
            <p className="mb-4">Select the type of card you would like to request.</p>
            {/* Simple form for new card request */}
            <select className="w-full p-2 border rounded mb-4">
              <option>Virtual Debit Card</option>
              <option>Physical Credit Card</option>
            </select>
            <Button type="submit" className="w-full bg-blue-500 text-white hover:bg-blue-600">
              Submit Request
            </Button>
          </form>
        );
      case 'details':
        if (!selectedCard) return null;
        return (
          <div className="space-y-3">
            <p><strong>Card Name:</strong> {selectedCard.name}</p>
            <p><strong>Card Number:</strong> **** **** **** {selectedCard.last4}</p>
            <p><strong>Status:</strong> {selectedCard.isFrozen ? 'Frozen' : 'Active'}</p>
            <p><strong>Expiry:</strong> {selectedCard.expiry}</p>
            <h4 className="font-bold mt-4">Recent Transactions</h4>
            {/* Filter transactions for the selected card */}
            <div className="h-40 overflow-y-auto border p-2 rounded">
              {transactions.filter(t => t.cardId === selectedCard.id).slice(0, 5).map(t => (
                <div key={t.id} className="flex justify-between text-sm py-1 border-b">
                  <span>{t.description}</span>
                  <span className={t.amount < 0 ? 'text-red-600' : 'text-green-600'}>
                    {t.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {transactions.filter(t => t.cardId === selectedCard.id).length === 0 && (
                <p className="text-gray-500 text-center py-4">No recent transactions for this card.</p>
              )}
            </div>
            <Button onClick={handleCloseModal} className="w-full bg-gray-200 text-gray-800 hover:bg-gray-300">
              Close
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <OfflineIndicator />
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Card Management</h1>
        <Button 
          onClick={handleRequestNewCard} 
          className="bg-green-500 text-white hover:bg-green-600 text-sm"
        >
          + New Card
        </Button>
      </header>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Your Cards</h2>
        {renderCardList()}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Card Transactions (All)</h2>
        {/* Simple list of all transactions - full list would be on a separate page */}
        <Card>
          <div className="space-y-2 h-64 overflow-y-auto">
            {transactions.slice(0, 10).map(t => (
              <div key={t.id} className="flex justify-between text-sm border-b pb-1">
                <span className="text-gray-600">{new Date(t.date).toLocaleDateString()} - {t.description}</span>
                <span className={t.amount < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                  {t.amount.toFixed(2)}
                </span>
              </div>
            ))}
            {transactions.length === 0 && !isLoading && !error && (
              <p className="text-gray-500 text-center py-4">No transactions found.</p>
            )}
          </div>
        </Card>
        <div className="mt-4 text-center">
          <Link to="/transactions" className="text-blue-500 hover:text-blue-700 font-medium text-sm">
            View All Transactions &rarr;
          </Link>
        </div>
      </section>

      <Modal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        title={modalType === 'new_card' ? 'Request New Card' : 'Card Details'}
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

// Mock Data for initial state (to be replaced by real API data in useEffect)
CardManagement.defaultProps = {
  initialCards: [
    { id: 'c1', name: 'Primary Debit', last4: '1234', isFrozen: false, expiry: '12/26', balance: 1500.50 },
    { id: 'c2', name: 'Virtual Shopping', last4: '5678', isFrozen: true, expiry: '08/25', balance: 500.00 },
  ],
  initialTransactions: [
    { id: 't1', cardId: 'c1', description: 'Starbucks', amount: -5.50, date: '2025-11-01' },
    { id: 't2', cardId: 'c1', description: 'Salary Deposit', amount: 2500.00, date: '2025-10-31' },
    { id: 't3', cardId: 'c2', description: 'Amazon Purchase', amount: -45.99, date: '2025-10-30' },
    { id: 't4', cardId: 'c1', description: 'Netflix', amount: -15.99, date: '2025-10-29' },
    { id: 't5', cardId: 'c2', description: 'Refund', amount: 10.00, date: '2025-10-28' },
  ]
};

// Mock ApiService to use defaultProps data for initial testing
ApiService.get = async (path) => {
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
  if (path === '/cards') {
    return { data: { cards: CardManagement.defaultProps.initialCards } };
  }
  if (path === '/transactions') {
    return { data: { transactions: CardManagement.defaultProps.initialTransactions } };
  }
  throw new Error('Not Found');
};
ApiService.post = async (path) => {
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
  if (path.startsWith('/cards/')) {
    return { success: true };
  }
  throw new Error('Not Found');
};
// Mock NotificationService
NotificationService.info = (msg) => console.log(`[INFO] ${msg}`);
NotificationService.error = (msg) => console.error(`[ERROR] ${msg}`);
NotificationService.success = (msg) => console.log(`[SUCCESS] ${msg}`);

export default CardManagement;