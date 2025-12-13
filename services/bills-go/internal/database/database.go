package database

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/bills-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu            sync.RWMutex
	billers       map[uuid.UUID]*models.Biller
	payments      map[uuid.UUID]*models.BillPayment
	subscriptions map[uuid.UUID]*models.Subscription
	savedBillers  map[uuid.UUID]*models.SavedBiller
	scheduled     map[uuid.UUID]*models.ScheduledPayment
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		billers:       make(map[uuid.UUID]*models.Biller),
		payments:      make(map[uuid.UUID]*models.BillPayment),
		subscriptions: make(map[uuid.UUID]*models.Subscription),
		savedBillers:  make(map[uuid.UUID]*models.SavedBiller),
		scheduled:     make(map[uuid.UUID]*models.ScheduledPayment),
	}
	db.seedBillers()
	return db
}

func (db *InMemoryDB) seedBillers() {
	now := time.Now()
	billers := []models.Biller{
		// Electricity
		{
			ID:             uuid.New(),
			Name:           "Ikeja Electric",
			Category:       models.BillCategoryElectricity,
			Code:           "IKEDC",
			Country:        "NG",
			RequiredFields: []string{"meter_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Eko Electricity",
			Category:       models.BillCategoryElectricity,
			Code:           "EKEDC",
			Country:        "NG",
			RequiredFields: []string{"meter_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Abuja Electricity",
			Category:       models.BillCategoryElectricity,
			Code:           "AEDC",
			Country:        "NG",
			RequiredFields: []string{"meter_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// TV
		{
			ID:             uuid.New(),
			Name:           "DSTV",
			Category:       models.BillCategoryTV,
			Code:           "DSTV",
			Country:        "NG",
			RequiredFields: []string{"smartcard_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "GOtv",
			Category:       models.BillCategoryTV,
			Code:           "GOTV",
			Country:        "NG",
			RequiredFields: []string{"smartcard_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Startimes",
			Category:       models.BillCategoryTV,
			Code:           "STARTIMES",
			Country:        "NG",
			RequiredFields: []string{"smartcard_number"},
			ServiceFee:     decimal.NewFromFloat(50),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Internet
		{
			ID:             uuid.New(),
			Name:           "Spectranet",
			Category:       models.BillCategoryInternet,
			Code:           "SPECTRANET",
			Country:        "NG",
			RequiredFields: []string{"account_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "Smile",
			Category:       models.BillCategoryInternet,
			Code:           "SMILE",
			Country:        "NG",
			RequiredFields: []string{"account_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Water
		{
			ID:             uuid.New(),
			Name:           "Lagos Water Corporation",
			Category:       models.BillCategoryWater,
			Code:           "LWC",
			Country:        "NG",
			RequiredFields: []string{"account_number"},
			ServiceFee:     decimal.NewFromFloat(50),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Government
		{
			ID:             uuid.New(),
			Name:           "FIRS - Federal Inland Revenue",
			Category:       models.BillCategoryGovernment,
			Code:           "FIRS",
			Country:        "NG",
			RequiredFields: []string{"tin"},
			ServiceFee:     decimal.NewFromFloat(0),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "LIRS - Lagos State Revenue",
			Category:       models.BillCategoryGovernment,
			Code:           "LIRS",
			Country:        "NG",
			RequiredFields: []string{"tin"},
			ServiceFee:     decimal.NewFromFloat(0),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		// Education
		{
			ID:             uuid.New(),
			Name:           "WAEC",
			Category:       models.BillCategoryEducation,
			Code:           "WAEC",
			Country:        "NG",
			RequiredFields: []string{"registration_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
		{
			ID:             uuid.New(),
			Name:           "JAMB",
			Category:       models.BillCategoryEducation,
			Code:           "JAMB",
			Country:        "NG",
			RequiredFields: []string{"registration_number"},
			ServiceFee:     decimal.NewFromFloat(100),
			FeeType:        "fixed",
			IsActive:       true,
			CreatedAt:      now,
		},
	}
	
	for i := range billers {
		db.billers[billers[i].ID] = &billers[i]
	}
}

// Biller operations
func (db *InMemoryDB) GetBillers(ctx context.Context) ([]*models.Biller, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var billers []*models.Biller
	for _, b := range db.billers {
		if b.IsActive {
			billers = append(billers, b)
		}
	}
	return billers, nil
}

func (db *InMemoryDB) GetBillersByCategory(ctx context.Context, category models.BillCategory) ([]*models.Biller, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var billers []*models.Biller
	for _, b := range db.billers {
		if b.IsActive && b.Category == category {
			billers = append(billers, b)
		}
	}
	return billers, nil
}

func (db *InMemoryDB) GetBiller(ctx context.Context, id uuid.UUID) (*models.Biller, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.billers[id], nil
}

// Payment operations
func (db *InMemoryDB) CreatePayment(ctx context.Context, payment *models.BillPayment) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.payments[payment.ID] = payment
	return nil
}

func (db *InMemoryDB) GetPayment(ctx context.Context, id uuid.UUID) (*models.BillPayment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.payments[id], nil
}

func (db *InMemoryDB) GetUserPayments(ctx context.Context, userID uuid.UUID) ([]*models.BillPayment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var payments []*models.BillPayment
	for _, p := range db.payments {
		if p.UserID == userID {
			payments = append(payments, p)
		}
	}
	return payments, nil
}

func (db *InMemoryDB) UpdatePayment(ctx context.Context, payment *models.BillPayment) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.payments[payment.ID] = payment
	return nil
}

// Subscription operations
func (db *InMemoryDB) CreateSubscription(ctx context.Context, subscription *models.Subscription) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.subscriptions[subscription.ID] = subscription
	return nil
}

func (db *InMemoryDB) GetSubscription(ctx context.Context, id uuid.UUID) (*models.Subscription, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.subscriptions[id], nil
}

func (db *InMemoryDB) GetUserSubscriptions(ctx context.Context, userID uuid.UUID) ([]*models.Subscription, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var subscriptions []*models.Subscription
	for _, s := range db.subscriptions {
		if s.UserID == userID {
			subscriptions = append(subscriptions, s)
		}
	}
	return subscriptions, nil
}

func (db *InMemoryDB) UpdateSubscription(ctx context.Context, subscription *models.Subscription) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.subscriptions[subscription.ID] = subscription
	return nil
}

func (db *InMemoryDB) DeleteSubscription(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.subscriptions, id)
	return nil
}

// Saved biller operations
func (db *InMemoryDB) CreateSavedBiller(ctx context.Context, savedBiller *models.SavedBiller) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.savedBillers[savedBiller.ID] = savedBiller
	return nil
}

func (db *InMemoryDB) GetUserSavedBillers(ctx context.Context, userID uuid.UUID) ([]*models.SavedBiller, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var savedBillers []*models.SavedBiller
	for _, sb := range db.savedBillers {
		if sb.UserID == userID {
			savedBillers = append(savedBillers, sb)
		}
	}
	return savedBillers, nil
}

func (db *InMemoryDB) DeleteSavedBiller(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.savedBillers, id)
	return nil
}

// Scheduled payment operations
func (db *InMemoryDB) CreateScheduledPayment(ctx context.Context, scheduled *models.ScheduledPayment) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.scheduled[scheduled.ID] = scheduled
	return nil
}

func (db *InMemoryDB) GetScheduledPayment(ctx context.Context, id uuid.UUID) (*models.ScheduledPayment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.scheduled[id], nil
}

func (db *InMemoryDB) GetUserScheduledPayments(ctx context.Context, userID uuid.UUID) ([]*models.ScheduledPayment, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var scheduled []*models.ScheduledPayment
	for _, s := range db.scheduled {
		if s.UserID == userID {
			scheduled = append(scheduled, s)
		}
	}
	return scheduled, nil
}

func (db *InMemoryDB) UpdateScheduledPayment(ctx context.Context, scheduled *models.ScheduledPayment) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.scheduled[scheduled.ID] = scheduled
	return nil
}

func (db *InMemoryDB) DeleteScheduledPayment(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.scheduled, id)
	return nil
}

// Helper functions
func GenerateReference() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("BILL%d%06d", time.Now().Unix(), rand.Intn(1000000))
}

func CalculateNextBillingDate(frequency string, currentDate time.Time) time.Time {
	switch frequency {
	case "weekly":
		return currentDate.AddDate(0, 0, 7)
	case "monthly":
		return currentDate.AddDate(0, 1, 0)
	case "yearly":
		return currentDate.AddDate(1, 0, 0)
	default:
		return currentDate.AddDate(0, 1, 0)
	}
}
