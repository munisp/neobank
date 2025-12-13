package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/banking-service/internal/config"
	"github.com/neobank/banking-service/internal/database"
	"github.com/neobank/banking-service/internal/models"
	"github.com/shopspring/decimal"
)

// CardHandler handles card-related HTTP requests
type CardHandler struct {
	db  *database.InMemoryDB
	cfg *config.Config
}

// NewCardHandler creates a new card handler
func NewCardHandler(db *database.InMemoryDB, cfg *config.Config) *CardHandler {
	return &CardHandler{db: db, cfg: cfg}
}

// CreateCard creates a new card
// POST /cards
func (h *CardHandler) CreateCard(c *gin.Context) {
	var req models.CreateCardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	// Generate card details
	pan := h.generatePAN(req.CardNetwork)
	cvv := h.generateCVV()
	expiryMonth := int(time.Now().Month())
	expiryYear := time.Now().Year() + 3

	// Set default limits if not provided
	dailyLimit := req.DailyLimit
	if dailyLimit.IsZero() {
		dailyLimit = decimal.NewFromInt(500000) // 500,000 NGN default
	}
	monthlyLimit := req.MonthlyLimit
	if monthlyLimit.IsZero() {
		monthlyLimit = decimal.NewFromInt(5000000) // 5,000,000 NGN default
	}
	transactionLimit := req.TransactionLimit
	if transactionLimit.IsZero() {
		transactionLimit = decimal.NewFromInt(200000) // 200,000 NGN default
	}

	card := &models.Card{
		UserID:           uid,
		AccountID:        req.AccountID,
		CardType:         req.CardType,
		CardNetwork:      req.CardNetwork,
		Status:           models.CardStatusPending,
		MaskedPAN:        maskPAN(pan),
		LastFourDigits:   pan[len(pan)-4:],
		ExpiryMonth:      expiryMonth,
		ExpiryYear:       expiryYear,
		CardholderName:   req.CardholderName,
		BillingAddress:   req.BillingAddress,
		DailyLimit:       dailyLimit,
		MonthlyLimit:     monthlyLimit,
		TransactionLimit: transactionLimit,
		DailySpent:       decimal.Zero,
		MonthlySpent:     decimal.Zero,
		IsContactless:    true,
		IsOnlineEnabled:  true,
		IsATMEnabled:     true,
		IsPOSEnabled:     true,
		CVV:              hashSecret(cvv),
		ExpiresAt:        time.Date(expiryYear, time.Month(expiryMonth), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, -1),
	}

	if err := h.db.CreateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create card"})
		return
	}

	// For virtual cards, auto-activate
	if req.CardType == models.CardTypeVirtual {
		now := time.Now()
		card.Status = models.CardStatusActive
		card.ActivatedAt = &now
		h.db.UpdateCard(c.Request.Context(), card)
	}

	c.JSON(http.StatusCreated, card)
}

// GetCard gets a card by ID
// GET /cards/:id
func (h *CardHandler) GetCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// GetUserCards gets all cards for the current user
// GET /cards
func (h *CardHandler) GetUserCards(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	cards, err := h.db.GetCardsByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get cards"})
		return
	}

	c.JSON(http.StatusOK, cards)
}

// ActivateCard activates a card
// POST /cards/:id/activate
func (h *CardHandler) ActivateCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	if card.Status != models.CardStatusPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card cannot be activated"})
		return
	}

	now := time.Now()
	card.Status = models.CardStatusActive
	card.ActivatedAt = &now

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to activate card"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// FreezeCard freezes a card
// POST /cards/:id/freeze
func (h *CardHandler) FreezeCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	if card.Status != models.CardStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card cannot be frozen"})
		return
	}

	card.Status = models.CardStatusFrozen

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to freeze card"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// UnfreezeCard unfreezes a card
// POST /cards/:id/unfreeze
func (h *CardHandler) UnfreezeCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	if card.Status != models.CardStatusFrozen {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card is not frozen"})
		return
	}

	card.Status = models.CardStatusActive

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unfreeze card"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// BlockCard blocks a card permanently
// POST /cards/:id/block
func (h *CardHandler) BlockCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	card.Status = models.CardStatusBlocked

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to block card"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Card blocked successfully"})
}

// UpdateCardLimits updates card spending limits
// PUT /cards/:id/limits
func (h *CardHandler) UpdateCardLimits(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	var req models.UpdateCardLimitsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	if req.DailyLimit != nil {
		card.DailyLimit = *req.DailyLimit
	}
	if req.MonthlyLimit != nil {
		card.MonthlyLimit = *req.MonthlyLimit
	}
	if req.TransactionLimit != nil {
		card.TransactionLimit = *req.TransactionLimit
	}

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update limits"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// UpdateCardControls updates card controls
// PUT /cards/:id/controls
func (h *CardHandler) UpdateCardControls(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	var req models.UpdateCardControlsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	if req.IsContactless != nil {
		card.IsContactless = *req.IsContactless
	}
	if req.IsOnlineEnabled != nil {
		card.IsOnlineEnabled = *req.IsOnlineEnabled
	}
	if req.IsATMEnabled != nil {
		card.IsATMEnabled = *req.IsATMEnabled
	}
	if req.IsPOSEnabled != nil {
		card.IsPOSEnabled = *req.IsPOSEnabled
	}

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update controls"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// SetPIN sets or changes the card PIN
// POST /cards/:id/pin
func (h *CardHandler) SetPIN(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	var req models.SetPINRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	card, err := h.db.GetCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
		return
	}

	// Verify current PIN if changing
	if card.PIN != "" && req.CurrentPIN != "" {
		if hashSecret(req.CurrentPIN) != card.PIN {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid current PIN"})
			return
		}
	}

	card.PIN = hashSecret(req.NewPIN)

	if err := h.db.UpdateCard(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set PIN"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "PIN set successfully"})
}

// GetCardTransactions gets transactions for a card
// GET /cards/:id/transactions
func (h *CardHandler) GetCardTransactions(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid card ID"})
		return
	}

	transactions, err := h.db.GetCardTransactions(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get transactions"})
		return
	}

	c.JSON(http.StatusOK, transactions)
}

// Helper functions

func (h *CardHandler) generatePAN(network models.CardNetwork) string {
	var prefix string
	switch network {
	case models.CardNetworkVisa:
		prefix = "4"
	case models.CardNetworkMastercard:
		prefix = "5"
	case models.CardNetworkVerve:
		prefix = "506"
	default:
		prefix = "4"
	}

	// Generate remaining digits
	remaining := 16 - len(prefix) - 1 // -1 for check digit
	pan := prefix
	for i := 0; i < remaining; i++ {
		b := make([]byte, 1)
		rand.Read(b)
		pan += fmt.Sprintf("%d", b[0]%10)
	}

	// Add Luhn check digit
	pan += calculateLuhnCheckDigit(pan)
	return pan
}

func (h *CardHandler) generateCVV() string {
	b := make([]byte, 3)
	rand.Read(b)
	return fmt.Sprintf("%03d", (int(b[0])*256*256+int(b[1])*256+int(b[2]))%1000)
}

func maskPAN(pan string) string {
	if len(pan) < 8 {
		return pan
	}
	return pan[:4] + "****" + pan[len(pan)-4:]
}

func hashSecret(secret string) string {
	hash := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(hash[:])
}

func calculateLuhnCheckDigit(number string) string {
	sum := 0
	for i := len(number) - 1; i >= 0; i-- {
		digit := int(number[i] - '0')
		if (len(number)-i)%2 == 1 {
			digit *= 2
			if digit > 9 {
				digit -= 9
			}
		}
		sum += digit
	}
	return fmt.Sprintf("%d", (10-(sum%10))%10)
}
