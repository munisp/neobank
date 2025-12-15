package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/telecom-service/internal/config"
	"github.com/neobank/telecom-service/internal/database"
	"github.com/neobank/telecom-service/internal/models"
	"github.com/neobank/telecom-service/pkg/kafka"
)

type TelecomHandler struct {
	db        *database.InMemoryDB
	cfg       *config.Config
	publisher *kafka.EventPublisher
}

func NewTelecomHandler(db *database.InMemoryDB, cfg *config.Config) *TelecomHandler {
	return &TelecomHandler{
		db:        db,
		cfg:       cfg,
		publisher: kafka.GetPublisher(),
	}
}

// GetNetworks returns available networks
// GET /networks
func (h *TelecomHandler) GetNetworks(c *gin.Context) {
	country := c.Query("country")
	
	var networks []*models.Network
	var err error
	
	if country != "" {
		networks, err = h.db.GetNetworksByCountry(c.Request.Context(), country)
	} else {
		networks, err = h.db.GetNetworks(c.Request.Context())
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get networks"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"networks": networks,
		"count":    len(networks),
	})
}

// GetNetwork returns a specific network
// GET /networks/:id
func (h *TelecomHandler) GetNetwork(c *gin.Context) {
	networkID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network ID"})
		return
	}
	
	network, err := h.db.GetNetwork(c.Request.Context(), networkID)
	if err != nil || network == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network not found"})
		return
	}
	
	c.JSON(http.StatusOK, network)
}

// ValidatePhone validates a phone number and detects network
// POST /validate-phone
func (h *TelecomHandler) ValidatePhone(c *gin.Context) {
	var req models.ValidatePhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Clean phone number
	phone := strings.TrimSpace(req.PhoneNumber)
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")
	
	// Convert +234 to 0
	if strings.HasPrefix(phone, "+234") {
		phone = "0" + phone[4:]
	} else if strings.HasPrefix(phone, "234") {
		phone = "0" + phone[3:]
	}
	
	// Validate length
	if len(phone) != 11 {
		c.JSON(http.StatusOK, models.ValidatePhoneResponse{
			Valid:       false,
			PhoneNumber: req.PhoneNumber,
			Message:     "Invalid phone number length",
		})
		return
	}
	
	// Get prefix (first 4 digits)
	prefix := phone[:4]
	
	network, err := h.db.GetNetworkByPrefix(c.Request.Context(), prefix)
	if err != nil || network == nil {
		c.JSON(http.StatusOK, models.ValidatePhoneResponse{
			Valid:       false,
			PhoneNumber: req.PhoneNumber,
			Message:     "Unknown network prefix",
		})
		return
	}
	
	c.JSON(http.StatusOK, models.ValidatePhoneResponse{
		Valid:       true,
		NetworkID:   network.ID,
		NetworkName: network.Name,
		PhoneNumber: phone,
		Message:     "Phone number validated successfully",
	})
}

// GetDataPlans returns data plans for a network
// GET /networks/:id/data-plans
func (h *TelecomHandler) GetDataPlans(c *gin.Context) {
	networkID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network ID"})
		return
	}
	
	plans, err := h.db.GetDataPlans(c.Request.Context(), networkID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get data plans"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"plans": plans,
		"count": len(plans),
	})
}

// BuyAirtime purchases airtime
// POST /airtime
func (h *TelecomHandler) BuyAirtime(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.BuyAirtimeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	network, err := h.db.GetNetwork(c.Request.Context(), req.NetworkID)
	if err != nil || network == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network not found"})
		return
	}
	
	if !network.SupportsAirtime {
		c.JSON(http.StatusBadRequest, gin.H{"error": "network does not support airtime"})
		return
	}
	
	now := time.Now()
	txn := &models.AirtimeTransaction{
		ID:          uuid.New(),
		UserID:      userID.(uuid.UUID),
		NetworkID:   network.ID,
		NetworkName: network.Name,
		PhoneNumber: req.PhoneNumber,
		Amount:      req.Amount,
		Currency:    "NGN",
		Status:      models.TransactionStatusProcessing,
		Reference:   database.GenerateReference(),
		CreatedAt:   now,
	}
	
	if err := h.db.CreateAirtimeTransaction(c.Request.Context(), txn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create transaction"})
		return
	}
	
	// Simulate processing
	txn.Status = models.TransactionStatusCompleted
	txn.StatusMessage = "Airtime delivered successfully"
	txn.CompletedAt = &now
	h.db.UpdateAirtimeTransaction(c.Request.Context(), txn)
	
	// Publish telecom event to Kafka for lakehouse analytics
	h.publisher.PublishTelecom(c.Request.Context(), map[string]interface{}{
		"transaction_id": txn.ID.String(),
		"user_id":        txn.UserID.String(),
		"network_id":     txn.NetworkID.String(),
		"network_name":   txn.NetworkName,
		"phone_number":   txn.PhoneNumber,
		"amount":         txn.Amount.String(),
		"type":           "airtime",
		"status":         string(txn.Status),
		"reference":      txn.Reference,
		"event_type":     "airtime_purchased",
		"created_at":     now.Format(time.RFC3339),
	})
	
	c.JSON(http.StatusCreated, gin.H{
		"transaction": txn,
		"message":     "Airtime purchased successfully",
	})
}

// GetAirtimeHistory returns airtime purchase history
// GET /airtime/history
func (h *TelecomHandler) GetAirtimeHistory(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	txns, err := h.db.GetUserAirtimeTransactions(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get transactions"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"transactions": txns,
		"count":        len(txns),
	})
}

// BuyData purchases a data plan
// POST /data
func (h *TelecomHandler) BuyData(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.BuyDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	network, err := h.db.GetNetwork(c.Request.Context(), req.NetworkID)
	if err != nil || network == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network not found"})
		return
	}
	
	if !network.SupportsData {
		c.JSON(http.StatusBadRequest, gin.H{"error": "network does not support data"})
		return
	}
	
	plan, err := h.db.GetDataPlan(c.Request.Context(), req.PlanID)
	if err != nil || plan == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "data plan not found"})
		return
	}
	
	now := time.Now()
	txn := &models.DataTransaction{
		ID:          uuid.New(),
		UserID:      userID.(uuid.UUID),
		NetworkID:   network.ID,
		NetworkName: network.Name,
		PlanID:      plan.ID,
		PlanName:    plan.Name,
		PhoneNumber: req.PhoneNumber,
		DataAmount:  plan.DataAmount,
		Validity:    plan.Validity,
		Amount:      plan.Price,
		Currency:    plan.Currency,
		Status:      models.TransactionStatusProcessing,
		Reference:   database.GenerateReference(),
		CreatedAt:   now,
	}
	
	if err := h.db.CreateDataTransaction(c.Request.Context(), txn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create transaction"})
		return
	}
	
	// Simulate processing
	txn.Status = models.TransactionStatusCompleted
	txn.StatusMessage = "Data plan activated successfully"
	txn.CompletedAt = &now
	h.db.UpdateDataTransaction(c.Request.Context(), txn)
	
	c.JSON(http.StatusCreated, gin.H{
		"transaction": txn,
		"message":     "Data plan purchased successfully",
	})
}

// GetDataHistory returns data purchase history
// GET /data/history
func (h *TelecomHandler) GetDataHistory(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	txns, err := h.db.GetUserDataTransactions(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get transactions"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"transactions": txns,
		"count":        len(txns),
	})
}

// GetESIMPlans returns available eSIM plans
// GET /esim/plans
func (h *TelecomHandler) GetESIMPlans(c *gin.Context) {
	region := c.Query("region")
	
	var plans []*models.ESIMPlan
	var err error
	
	if region != "" {
		plans, err = h.db.GetESIMPlansByRegion(c.Request.Context(), region)
	} else {
		plans, err = h.db.GetESIMPlans(c.Request.Context())
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get eSIM plans"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"plans": plans,
		"count": len(plans),
	})
}

// GetESIMPlan returns a specific eSIM plan
// GET /esim/plans/:id
func (h *TelecomHandler) GetESIMPlan(c *gin.Context) {
	planID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid plan ID"})
		return
	}
	
	plan, err := h.db.GetESIMPlan(c.Request.Context(), planID)
	if err != nil || plan == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "eSIM plan not found"})
		return
	}
	
	c.JSON(http.StatusOK, plan)
}

// BuyESIM purchases an eSIM
// POST /esim
func (h *TelecomHandler) BuyESIM(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.BuyESIMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	plan, err := h.db.GetESIMPlan(c.Request.Context(), req.PlanID)
	if err != nil || plan == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "eSIM plan not found"})
		return
	}
	
	now := time.Now()
	expiresAt := now.AddDate(0, 0, plan.Validity)
	
	purchase := &models.ESIMPurchase{
		ID:             uuid.New(),
		UserID:         userID.(uuid.UUID),
		PlanID:         plan.ID,
		PlanName:       plan.Name,
		ICCID:          database.GenerateICCID(),
		ActivationCode: database.GenerateActivationCode(),
		QRCode:         "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		DataAmount:     plan.DataAmount,
		Validity:       plan.Validity,
		Countries:      plan.Countries,
		Amount:         plan.Price,
		Currency:       plan.Currency,
		Status:         "pending",
		ExpiresAt:      &expiresAt,
		DataUsed:       0,
		DataRemaining:  plan.DataBytes,
		Reference:      database.GenerateReference(),
		CreatedAt:      now,
	}
	
	if err := h.db.CreateESIMPurchase(c.Request.Context(), purchase); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create eSIM purchase"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"purchase": purchase,
		"message":  "eSIM purchased successfully. Scan the QR code to activate.",
	})
}

// GetMyESIMs returns user's eSIM purchases
// GET /esim/my
func (h *TelecomHandler) GetMyESIMs(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	purchases, err := h.db.GetUserESIMPurchases(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get eSIM purchases"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"esims": purchases,
		"count": len(purchases),
	})
}

// GetESIMDetails returns details of a specific eSIM
// GET /esim/:id
func (h *TelecomHandler) GetESIMDetails(c *gin.Context) {
	esimID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid eSIM ID"})
		return
	}
	
	purchase, err := h.db.GetESIMPurchase(c.Request.Context(), esimID)
	if err != nil || purchase == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "eSIM not found"})
		return
	}
	
	c.JSON(http.StatusOK, purchase)
}

// ActivateESIM activates an eSIM
// POST /esim/:id/activate
func (h *TelecomHandler) ActivateESIM(c *gin.Context) {
	esimID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid eSIM ID"})
		return
	}
	
	purchase, err := h.db.GetESIMPurchase(c.Request.Context(), esimID)
	if err != nil || purchase == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "eSIM not found"})
		return
	}
	
	if purchase.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "eSIM is already activated or expired"})
		return
	}
	
	now := time.Now()
	purchase.Status = "active"
	purchase.ActivatedAt = &now
	
	if err := h.db.UpdateESIMPurchase(c.Request.Context(), purchase); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to activate eSIM"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"purchase": purchase,
		"message":  "eSIM activated successfully",
	})
}

// SaveBeneficiary saves a phone number
// POST /beneficiaries
func (h *TelecomHandler) SaveBeneficiary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	var req models.SaveBeneficiaryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	network, err := h.db.GetNetwork(c.Request.Context(), req.NetworkID)
	if err != nil || network == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network not found"})
		return
	}
	
	now := time.Now()
	beneficiary := &models.SavedBeneficiary{
		ID:             uuid.New(),
		UserID:         userID.(uuid.UUID),
		NetworkID:      network.ID,
		NetworkName:    network.Name,
		PhoneNumber:    req.PhoneNumber,
		Nickname:       req.Nickname,
		AutoRecharge:   req.AutoRecharge,
		RechargeAmount: req.RechargeAmount,
		RechargeDay:    req.RechargeDay,
		CreatedAt:      now,
	}
	
	if err := h.db.CreateBeneficiary(c.Request.Context(), beneficiary); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save beneficiary"})
		return
	}
	
	c.JSON(http.StatusCreated, beneficiary)
}

// GetBeneficiaries returns saved beneficiaries
// GET /beneficiaries
func (h *TelecomHandler) GetBeneficiaries(c *gin.Context) {
	userID, _ := c.Get("user_id")
	
	beneficiaries, err := h.db.GetUserBeneficiaries(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get beneficiaries"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"beneficiaries": beneficiaries,
		"count":         len(beneficiaries),
	})
}

// DeleteBeneficiary removes a saved beneficiary
// DELETE /beneficiaries/:id
func (h *TelecomHandler) DeleteBeneficiary(c *gin.Context) {
	beneficiaryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid beneficiary ID"})
		return
	}
	
	if err := h.db.DeleteBeneficiary(c.Request.Context(), beneficiaryID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete beneficiary"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Beneficiary deleted"})
}

// GetRegions returns available eSIM regions
// GET /esim/regions
func (h *TelecomHandler) GetRegions(c *gin.Context) {
	regions := []gin.H{
		{"code": "africa", "name": "Africa", "countries_count": 8},
		{"code": "europe", "name": "Europe", "countries_count": 8},
		{"code": "asia", "name": "Asia", "countries_count": 10},
		{"code": "global", "name": "Global", "countries_count": 100},
	}
	
	c.JSON(http.StatusOK, gin.H{
		"regions": regions,
	})
}
