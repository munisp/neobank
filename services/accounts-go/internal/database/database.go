package database

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neobank/accounts-service/internal/models"
	"github.com/shopspring/decimal"
)

type InMemoryDB struct {
	mu          sync.RWMutex
	accounts    map[uuid.UUID]*models.Account
	invitations map[uuid.UUID]*models.AccountInvitation
	controls    map[uuid.UUID]*models.SpendingControl
}

func NewInMemoryDB() *InMemoryDB {
	return &InMemoryDB{
		accounts:    make(map[uuid.UUID]*models.Account),
		invitations: make(map[uuid.UUID]*models.AccountInvitation),
		controls:    make(map[uuid.UUID]*models.SpendingControl),
	}
}

// Account operations
func (db *InMemoryDB) CreateAccount(ctx context.Context, account *models.Account) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.accounts[account.ID] = account
	return nil
}

func (db *InMemoryDB) GetAccount(ctx context.Context, id uuid.UUID) (*models.Account, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.accounts[id], nil
}

func (db *InMemoryDB) GetUserAccounts(ctx context.Context, userID uuid.UUID) ([]*models.Account, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var accounts []*models.Account
	for _, a := range db.accounts {
		if a.UserID == userID {
			accounts = append(accounts, a)
		}
		// Also include joint accounts where user is an owner
		if a.JointDetails != nil {
			for _, owner := range a.JointDetails.Owners {
				if owner.UserID == userID && owner.Status == "accepted" {
					accounts = append(accounts, a)
					break
				}
			}
		}
	}
	return accounts, nil
}

func (db *InMemoryDB) GetUserAccountsByType(ctx context.Context, userID uuid.UUID, accountType models.AccountType) ([]*models.Account, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var accounts []*models.Account
	for _, a := range db.accounts {
		if a.UserID == userID && a.Type == accountType {
			accounts = append(accounts, a)
		}
	}
	return accounts, nil
}

func (db *InMemoryDB) GetKidsAccountsByParent(ctx context.Context, parentID uuid.UUID) ([]*models.Account, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var accounts []*models.Account
	for _, a := range db.accounts {
		if a.Type == models.AccountTypeKids && a.KidsDetails != nil && a.KidsDetails.ParentID == parentID {
			accounts = append(accounts, a)
		}
	}
	return accounts, nil
}

func (db *InMemoryDB) UpdateAccount(ctx context.Context, account *models.Account) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.accounts[account.ID] = account
	return nil
}

func (db *InMemoryDB) DeleteAccount(ctx context.Context, id uuid.UUID) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	delete(db.accounts, id)
	return nil
}

// Invitation operations
func (db *InMemoryDB) CreateInvitation(ctx context.Context, invitation *models.AccountInvitation) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.invitations[invitation.ID] = invitation
	return nil
}

func (db *InMemoryDB) GetInvitation(ctx context.Context, id uuid.UUID) (*models.AccountInvitation, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.invitations[id], nil
}

func (db *InMemoryDB) GetInvitationsByEmail(ctx context.Context, email string) ([]*models.AccountInvitation, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var invitations []*models.AccountInvitation
	for _, i := range db.invitations {
		if i.InviteeEmail == email && i.Status == "pending" {
			invitations = append(invitations, i)
		}
	}
	return invitations, nil
}

func (db *InMemoryDB) GetAccountInvitations(ctx context.Context, accountID uuid.UUID) ([]*models.AccountInvitation, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var invitations []*models.AccountInvitation
	for _, i := range db.invitations {
		if i.AccountID == accountID {
			invitations = append(invitations, i)
		}
	}
	return invitations, nil
}

func (db *InMemoryDB) UpdateInvitation(ctx context.Context, invitation *models.AccountInvitation) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.invitations[invitation.ID] = invitation
	return nil
}

// Spending control operations
func (db *InMemoryDB) CreateSpendingControl(ctx context.Context, control *models.SpendingControl) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.controls[control.ID] = control
	return nil
}

func (db *InMemoryDB) GetAccountSpendingControls(ctx context.Context, accountID uuid.UUID) ([]*models.SpendingControl, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	
	var controls []*models.SpendingControl
	for _, c := range db.controls {
		if c.AccountID == accountID {
			controls = append(controls, c)
		}
	}
	return controls, nil
}

func (db *InMemoryDB) UpdateSpendingControl(ctx context.Context, control *models.SpendingControl) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.controls[control.ID] = control
	return nil
}

// Helper functions
func GenerateAccountNumber() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%010d", rand.Int63n(10000000000))
}

func CalculateAge(dob time.Time) int {
	now := time.Now()
	years := now.Year() - dob.Year()
	if now.YearDay() < dob.YearDay() {
		years--
	}
	return years
}

func GetDefaultKidsLimits() (decimal.Decimal, decimal.Decimal, decimal.Decimal) {
	return decimal.NewFromFloat(5000), decimal.NewFromFloat(20000), decimal.NewFromFloat(50000)
}
