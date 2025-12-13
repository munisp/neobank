package database

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/telecom-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu              sync.RWMutex
	networks        map[uuid.UUID]*models.Network
	dataPlans       map[uuid.UUID]*models.DataPlan
	esimPlans       map[uuid.UUID]*models.ESIMPlan
	airtimeTxns     map[uuid.UUID]*models.AirtimeTransaction
	dataTxns        map[uuid.UUID]*models.DataTransaction
	esimPurchases   map[uuid.UUID]*models.ESIMPurchase
	beneficiaries   map[uuid.UUID]*models.SavedBeneficiary
}

func NewInMemoryDB() *InMemoryDB {
	db := &InMemoryDB{
		networks:      make(map[uuid.UUID]*models.Network),
		dataPlans:     make(map[uuid.UUID]*models.DataPlan),
		esimPlans:     make(map[uuid.UUID]*models.ESIMPlan),
		airtimeTxns:   make(map[uuid.UUID]*models.AirtimeTransaction),
		dataTxns:      make(map[uuid.UUID]*models.DataTransaction),
		esimPurchases: make(map[uuid.UUID]*models.ESIMPurchase),
		beneficiaries: make(map[uuid.UUID]*models.SavedBeneficiary),
	}
	db.seedNetworks()
	db.seedDataPlans()
	db.seedESIMPlans()
	return db
}

func (db *InMemoryDB) seedNetworks() {
	now := time.Now()
	networks := []models.Network{
		{
			ID:              uuid.New(),
			Name:            "MTN Nigeria",
			Code:            "MTN",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"0803", "0806", "0813", "0816", "0703", "0706", "0903", "0906"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Airtel Nigeria",
			Code:            "AIRTEL",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"0802", "0808", "0812", "0701", "0708", "0902", "0907", "0901"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Glo Nigeria",
			Code:            "GLO",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    false,
			PhonePrefix:     []string{"0805", "0807", "0811", "0815", "0705", "0905"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "9mobile Nigeria",
			Code:            "9MOBILE",
			Country:         "NG",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    false,
			PhonePrefix:     []string{"0809", "0817", "0818", "0908", "0909"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Safaricom Kenya",
			Code:            "SAFARICOM",
			Country:         "KE",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"0700", "0701", "0702", "0703", "0704", "0705", "0706", "0707", "0708", "0709", "0710", "0711", "0712"},
			IsActive:        true,
			CreatedAt:       now,
		},
		{
			ID:              uuid.New(),
			Name:            "Vodacom South Africa",
			Code:            "VODACOM",
			Country:         "ZA",
			SupportsAirtime: true,
			SupportsData:    true,
			SupportsESIM:    true,
			PhonePrefix:     []string{"072", "073", "082", "083"},
			IsActive:        true,
			CreatedAt:       now,
		},
	}
	
	for i := range networks {
		db.networks[networks[i].ID] = &networks[i]
	}
}

func (db *InMemoryDB) seedDataPlans() {
	now := time.Now()
	
	// Get MTN network ID
	var mtnID, airtelID, gloID uuid.UUID
	for id, n := range db.networks {
		switch n.Code {
		case "MTN":
			mtnID = id
		case "AIRTEL":
			airtelID = id
		case "GLO":
			gloID = id
		}
	}
	
	plans := []models.DataPlan{
		// MTN Plans
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Daily 100MB", DataAmount: "100MB", DataBytes: 104857600, Validity: 1, Price: decimal.NewFromInt(100), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Daily 1GB", DataAmount: "1GB", DataBytes: 1073741824, Validity: 1, Price: decimal.NewFromInt(350), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Weekly 1.5GB", DataAmount: "1.5GB", DataBytes: 1610612736, Validity: 7, Price: decimal.NewFromInt(500), Currency: "NGN", PlanType: "weekly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Monthly 2GB", DataAmount: "2GB", DataBytes: 2147483648, Validity: 30, Price: decimal.NewFromInt(1200), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Monthly 5GB", DataAmount: "5GB", DataBytes: 5368709120, Validity: 30, Price: decimal.NewFromInt(2500), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: mtnID, NetworkName: "MTN Nigeria", Name: "Monthly 10GB", DataAmount: "10GB", DataBytes: 10737418240, Validity: 30, Price: decimal.NewFromInt(5000), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		
		// Airtel Plans
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Daily 100MB", DataAmount: "100MB", DataBytes: 104857600, Validity: 1, Price: decimal.NewFromInt(100), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Weekly 1GB", DataAmount: "1GB", DataBytes: 1073741824, Validity: 7, Price: decimal.NewFromInt(500), Currency: "NGN", PlanType: "weekly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Monthly 3GB", DataAmount: "3GB", DataBytes: 3221225472, Validity: 30, Price: decimal.NewFromInt(1500), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: airtelID, NetworkName: "Airtel Nigeria", Name: "Monthly 10GB", DataAmount: "10GB", DataBytes: 10737418240, Validity: 30, Price: decimal.NewFromInt(4000), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
		
		// Glo Plans
		{ID: uuid.New(), NetworkID: gloID, NetworkName: "Glo Nigeria", Name: "Daily 200MB", DataAmount: "200MB", DataBytes: 209715200, Validity: 1, Price: decimal.NewFromInt(100), Currency: "NGN", PlanType: "daily", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: gloID, NetworkName: "Glo Nigeria", Name: "Weekly 1.6GB", DataAmount: "1.6GB", DataBytes: 1717986918, Validity: 7, Price: decimal.NewFromInt(500), Currency: "NGN", PlanType: "weekly", IsActive: true, CreatedAt: now},
		{ID: uuid.New(), NetworkID: gloID, NetworkName: "Glo Nigeria", Name: "Monthly 4.5GB", DataAmount: "4.5GB", DataBytes: 4831838208, Validity: 30, Price: decimal.NewFromInt(2000), Currency: "NGN", PlanType: "monthly", IsActive: true, CreatedAt: now},
	}
	
	for i := range plans {
		db.dataPlans[plans[i].ID] = &plans[i]
	}
}

func (db *InMemoryDB) seedESIMPlans() {
	now := time.Now()
	plans := []models.ESIMPlan{
		// Africa Regional
		{
			ID:          uuid.New(),
			Name:        "Africa 1GB",
			Description: "1GB data for 7 days across Africa",
			Countries:   []string{"NG", "KE", "ZA", "GH", "EG", "MA", "TZ", "UG"},
			Region:      "africa",
			DataAmount:  "1GB",
			DataBytes:   1073741824,
			Validity:    7,
			Price:       decimal.NewFromInt(5000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Africa 3GB",
			Description: "3GB data for 15 days across Africa",
			Countries:   []string{"NG", "KE", "ZA", "GH", "EG", "MA", "TZ", "UG"},
			Region:      "africa",
			DataAmount:  "3GB",
			DataBytes:   3221225472,
			Validity:    15,
			Price:       decimal.NewFromInt(12000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Africa 5GB",
			Description: "5GB data for 30 days across Africa",
			Countries:   []string{"NG", "KE", "ZA", "GH", "EG", "MA", "TZ", "UG"},
			Region:      "africa",
			DataAmount:  "5GB",
			DataBytes:   5368709120,
			Validity:    30,
			Price:       decimal.NewFromInt(18000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		// Europe
		{
			ID:          uuid.New(),
			Name:        "Europe 1GB",
			Description: "1GB data for 7 days across Europe",
			Countries:   []string{"GB", "FR", "DE", "IT", "ES", "NL", "BE", "PT"},
			Region:      "europe",
			DataAmount:  "1GB",
			DataBytes:   1073741824,
			Validity:    7,
			Price:       decimal.NewFromInt(8000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Europe 5GB",
			Description: "5GB data for 30 days across Europe",
			Countries:   []string{"GB", "FR", "DE", "IT", "ES", "NL", "BE", "PT"},
			Region:      "europe",
			DataAmount:  "5GB",
			DataBytes:   5368709120,
			Validity:    30,
			Price:       decimal.NewFromInt(25000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		// Global
		{
			ID:          uuid.New(),
			Name:        "Global 1GB",
			Description: "1GB data for 7 days worldwide",
			Countries:   []string{"US", "GB", "FR", "DE", "JP", "AU", "CA", "SG"},
			Region:      "global",
			DataAmount:  "1GB",
			DataBytes:   1073741824,
			Validity:    7,
			Price:       decimal.NewFromInt(10000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
		{
			ID:          uuid.New(),
			Name:        "Global 5GB",
			Description: "5GB data for 30 days worldwide",
			Countries:   []string{"US", "GB", "FR", "DE", "JP", "AU", "CA", "SG"},
			Region:      "global",
			DataAmount:  "5GB",
			DataBytes:   5368709120,
			Validity:    30,
			Price:       decimal.NewFromInt(35000),
			Currency:    "NGN",
			Hotspot:     true,
			IsActive:    true,
			CreatedAt:   now,
		},
	}
	
	for i := range plans {
		db.esimPlans[plans[i].ID] = &plans[i]
	}
}

// Network operations
func (db *InMemoryDB) GetNetworks(ctx context.Context) ([]*models.Network, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var networks []*models.Network
	for _, n := range db.networks {
		if n.IsActive {
			networks = append(networks, n)
		}
	}
	return networks, nil
}

func (db *InMemoryDB) GetNetworksByCountry(ctx context.Context, country string) ([]*models.Network, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var networks []*models.Network
	for _, n := range db.networks {
		if n.IsActive && n.Country == country {
			networks = append(networks, n)
		}
	}
	return networks, nil
}

func (db *InMemoryDB) GetNetwork(ctx context.Context, id uuid.UUID) (*models.Network, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.networks[id], nil
}

func (db *InMemoryDB) GetNetworkByPrefix(ctx context.Context, prefix string) (*models.Network, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	for _, n := range db.networks {
		for _, p := range n.PhonePrefix {
			if p == prefix {
				return n, nil
			}
		}
	}
	return nil, nil
}

// Data plan operations
func (db *InMemoryDB) GetDataPlans(ctx context.Context, networkID uuid.UUID) ([]*models.DataPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var plans []*models.DataPlan
	for _, p := range db.dataPlans {
		if p.IsActive && p.NetworkID == networkID {
			plans = append(plans, p)
		}
	}
	return plans, nil
}

func (db *InMemoryDB) GetDataPlan(ctx context.Context, id uuid.UUID) (*models.DataPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.dataPlans[id], nil
}

// eSIM plan operations
func (db *InMemoryDB) GetESIMPlans(ctx context.Context) ([]*models.ESIMPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var plans []*models.ESIMPlan
	for _, p := range db.esimPlans {
		if p.IsActive {
			plans = append(plans, p)
		}
	}
	return plans, nil
}

func (db *InMemoryDB) GetESIMPlansByRegion(ctx context.Context, region string) ([]*models.ESIMPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var plans []*models.ESIMPlan
	for _, p := range db.esimPlans {
		if p.IsActive && p.Region == region {
			plans = append(plans, p)
		}
	}
	return plans, nil
}

func (db *InMemoryDB) GetESIMPlan(ctx context.Context, id uuid.UUID) (*models.ESIMPlan, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.esimPlans[id], nil
}

// Airtime transaction operations
func (db *InMemoryDB) CreateAirtimeTransaction(ctx context.Context, txn *models.AirtimeTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.airtimeTxns[txn.ID] = txn
	return nil
}

func (db *InMemoryDB) GetUserAirtimeTransactions(ctx context.Context, userID uuid.UUID) ([]*models.AirtimeTransaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var txns []*models.AirtimeTransaction
	for _, t := range db.airtimeTxns {
		if t.UserID == userID {
			txns = append(txns, t)
		}
	}
	return txns, nil
}

func (db *InMemoryDB) UpdateAirtimeTransaction(ctx context.Context, txn *models.AirtimeTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.airtimeTxns[txn.ID] = txn
	return nil
}

// Data transaction operations
func (db *InMemoryDB) CreateDataTransaction(ctx context.Context, txn *models.DataTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.dataTxns[txn.ID] = txn
	return nil
}

func (db *InMemoryDB) GetUserDataTransactions(ctx context.Context, userID uuid.UUID) ([]*models.DataTransaction, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var txns []*models.DataTransaction
	for _, t := range db.dataTxns {
		if t.UserID == userID {
			txns = append(txns, t)
		}
	}
	return txns, nil
}

func (db *InMemoryDB) UpdateDataTransaction(ctx context.Context, txn *models.DataTransaction) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.dataTxns[txn.ID] = txn
	return nil
}

// eSIM purchase operations
func (db *InMemoryDB) CreateESIMPurchase(ctx context.Context, purchase *models.ESIMPurchase) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.esimPurchases[purchase.ID] = purchase
	return nil
}

func (db *InMemoryDB) GetESIMPurchase(ctx context.Context, id uuid.UUID) (*models.ESIMPurchase, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.esimPurchases[id], nil
}

func (db *InMemoryDB) GetUserESIMPurchases(ctx context.Context, userID uuid.UUID) ([]*models.ESIMPurchase, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var purchases []*models.ESIMPurchase
	for _, p := range db.esimPurchases {
		if p.UserID == userID {
			purchases = append(purchases, p)
		}
	}
	return purchases, nil
}

func (db *InMemoryDB) UpdateESIMPurchase(ctx context.Context, purchase *models.ESIMPurchase) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.esimPurchases[purchase.ID] = purchase
	return nil
}

// Beneficiary operations
func (db *InMemoryDB) CreateBeneficiary(ctx context.Context, beneficiary *models.SavedBeneficiary) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.beneficiaries[beneficiary.ID] = beneficiary
	return nil
}

func (db *InMemoryDB) GetUserBeneficiaries(ctx context.Context, userID uuid.UUID) ([]*models.SavedBeneficiary, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var beneficiaries []*models.SavedBeneficiary
	for _, b := range db.beneficiaries {
		if b.UserID == userID {
			beneficiaries = append(beneficiaries, b)
		}
	}
	return beneficiaries, nil
}

func (db *InMemoryDB) DeleteBeneficiary(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.beneficiaries, id)
	return nil
}

// Helper functions
func GenerateReference() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("TEL%d%06d", time.Now().Unix(), rand.Intn(1000000))
}

func GenerateICCID() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("8923%018d", rand.Int63n(1000000000000000000))
}

func GenerateActivationCode() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("LPA:1$%s$%s", "esim.neobank.com", uuid.New().String()[:8])
}
