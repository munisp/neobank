package handlers

import (
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/neobank/banking-service/internal/config"
	"github.com/neobank/banking-service/internal/database"
	"github.com/neobank/banking-service/internal/models"
	"github.com/shopspring/decimal"
)

// LoanHandler handles loan-related HTTP requests
type LoanHandler struct {
	db  database.Store
	cfg *config.Config
}

// NewLoanHandler creates a new loan handler
func NewLoanHandler(db database.Store, cfg *config.Config) *LoanHandler {
	return &LoanHandler{db: db, cfg: cfg}
}

// ApplyForLoan handles loan application
// POST /loans/apply
func (h *LoanHandler) ApplyForLoan(c *gin.Context) {
	var req models.CreateLoanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	// Calculate interest rate based on loan type and amount
	interestRate := h.calculateInterestRate(req.LoanType, req.Amount, req.TermMonths)

	// Calculate debt-to-income ratio
	dtiRatio := decimal.Zero
	if !req.MonthlyIncome.IsZero() {
		monthlyDebtPayment := req.ExistingDebts.Div(decimal.NewFromInt(12))
		dtiRatio = monthlyDebtPayment.Div(req.MonthlyIncome).Mul(decimal.NewFromInt(100))
	}

	loan := &models.LoanApplication{
		UserID:            uid,
		LoanType:          req.LoanType,
		Amount:            req.Amount,
		Currency:          req.Currency,
		TermMonths:        req.TermMonths,
		InterestRate:      interestRate,
		Purpose:           req.Purpose,
		Status:            models.LoanStatusPending,
		CollateralType:    req.CollateralType,
		CollateralValue:   req.CollateralValue,
		EmploymentStatus:  req.EmploymentStatus,
		MonthlyIncome:     req.MonthlyIncome,
		ExistingDebts:     req.ExistingDebts,
		DebtToIncomeRatio: dtiRatio,
	}

	if err := h.db.CreateLoan(c.Request.Context(), loan); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create loan application"})
		return
	}

	// Perform initial risk assessment
	riskScore := h.calculateRiskScore(loan)
	loan.RiskScore = riskScore

	// Auto-approve low-risk loans under certain threshold
	if riskScore.LessThan(decimal.NewFromFloat(30)) && req.Amount.LessThan(decimal.NewFromInt(500000)) {
		loan.Status = models.LoanStatusApproved
		loan.ApprovedAmount = req.Amount
		h.calculateLoanTerms(loan)
	} else {
		loan.Status = models.LoanStatusUnderReview
	}

	h.db.UpdateLoan(c.Request.Context(), loan)

	c.JSON(http.StatusCreated, loan)
}

// GetLoan gets a loan by ID
// GET /loans/:id
func (h *LoanHandler) GetLoan(c *gin.Context) {
	loanID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid loan ID"})
		return
	}

	loan, err := h.db.GetLoan(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "loan not found"})
		return
	}

	c.JSON(http.StatusOK, loan)
}

// GetUserLoans gets all loans for the current user
// GET /loans
func (h *LoanHandler) GetUserLoans(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	loans, err := h.db.GetLoansByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get loans"})
		return
	}

	c.JSON(http.StatusOK, loans)
}

// GetLoanSummary gets loan summary for the current user
// GET /loans/summary
func (h *LoanHandler) GetLoanSummary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(uuid.UUID)

	summary, err := h.db.GetLoanSummary(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get loan summary"})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// ProcessLoanDecision processes loan approval/rejection
// POST /loans/:id/decision
func (h *LoanHandler) ProcessLoanDecision(c *gin.Context) {
	loanID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid loan ID"})
		return
	}

	var req models.LoanDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	loan, err := h.db.GetLoan(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "loan not found"})
		return
	}

	if loan.Status != models.LoanStatusPending && loan.Status != models.LoanStatusUnderReview {
		c.JSON(http.StatusBadRequest, gin.H{"error": "loan is not pending review"})
		return
	}

	if req.Decision == "approve" {
		loan.Status = models.LoanStatusApproved
		loan.ApprovedAmount = req.ApprovedAmount
		if !req.InterestRate.IsZero() {
			loan.InterestRate = req.InterestRate
		}
		loan.ReviewNotes = req.Notes
		h.calculateLoanTerms(loan)
	} else {
		loan.Status = models.LoanStatusRejected
		loan.RejectionReason = req.RejectionReason
		loan.ReviewNotes = req.Notes
	}

	if err := h.db.UpdateLoan(c.Request.Context(), loan); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update loan"})
		return
	}

	c.JSON(http.StatusOK, loan)
}

// DisburseLoan disburses an approved loan
// POST /loans/:id/disburse
func (h *LoanHandler) DisburseLoan(c *gin.Context) {
	loanID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid loan ID"})
		return
	}

	loan, err := h.db.GetLoan(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "loan not found"})
		return
	}

	if loan.Status != models.LoanStatusApproved {
		c.JSON(http.StatusBadRequest, gin.H{"error": "loan is not approved"})
		return
	}

	// Generate repayment schedule
	schedule := h.generateRepaymentSchedule(loan)
	// Convert to pointer slice for database
	paymentPtrs := make([]*models.LoanRepayment, len(schedule.Payments))
	for i := range schedule.Payments {
		paymentPtrs[i] = &schedule.Payments[i]
	}
	if err := h.db.CreateLoanRepayments(c.Request.Context(), loan.ID, paymentPtrs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create repayment schedule"})
		return
	}

	// Update loan status
	now := time.Now()
	loan.Status = models.LoanStatusDisbursed
	loan.DisbursementDate = &now
	firstPayment := now.AddDate(0, 1, 0)
	loan.FirstPaymentDate = &firstPayment
	maturity := now.AddDate(0, loan.TermMonths, 0)
	loan.MaturityDate = &maturity

	if err := h.db.UpdateLoan(c.Request.Context(), loan); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update loan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"loan":     loan,
		"schedule": schedule,
	})
}

// GetRepaymentSchedule gets the repayment schedule for a loan
// GET /loans/:id/schedule
func (h *LoanHandler) GetRepaymentSchedule(c *gin.Context) {
	loanID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid loan ID"})
		return
	}

	loan, err := h.db.GetLoan(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "loan not found"})
		return
	}

	repayments, err := h.db.GetLoanRepayments(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get repayments"})
		return
	}

	// Calculate outstanding balance
	outstanding := loan.ApprovedAmount
	for _, r := range repayments {
		outstanding = outstanding.Sub(r.PrincipalPaid)
	}

	schedule := &models.LoanSchedule{
		LoanID:           loanID,
		TotalPayments:    loan.TermMonths,
		MonthlyPayment:   loan.MonthlyPayment,
		TotalPrincipal:   loan.ApprovedAmount,
		TotalInterest:    loan.TotalInterest,
		TotalRepayment:   loan.TotalRepayment,
		OutstandingBalance: outstanding,
	}

	// Convert to slice of LoanRepayment
	payments := make([]models.LoanRepayment, len(repayments))
	for i, r := range repayments {
		payments[i] = *r
	}
	schedule.Payments = payments

	c.JSON(http.StatusOK, schedule)
}

// MakePayment processes a loan payment
// POST /loans/:id/payments
func (h *LoanHandler) MakePayment(c *gin.Context) {
	loanID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid loan ID"})
		return
	}

	var req models.MakePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	loan, err := h.db.GetLoan(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "loan not found"})
		return
	}

	if loan.Status != models.LoanStatusDisbursed && loan.Status != models.LoanStatusActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "loan is not active"})
		return
	}

	// Find next pending repayment
	repayments, _ := h.db.GetLoanRepayments(c.Request.Context(), loanID)
	var nextRepayment *models.LoanRepayment
	for _, r := range repayments {
		if r.Status == "pending" || r.Status == "overdue" {
			nextRepayment = r
			break
		}
	}

	if nextRepayment == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no pending payments"})
		return
	}

	// Process payment
	now := time.Now()
	nextRepayment.TotalPaid = req.Amount
	nextRepayment.PrincipalPaid = nextRepayment.PrincipalDue
	nextRepayment.InterestPaid = nextRepayment.InterestDue
	nextRepayment.Status = "paid"
	nextRepayment.PaidAt = &now

	if err := h.db.UpdateLoanRepayment(c.Request.Context(), nextRepayment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process payment"})
		return
	}

	// Check if loan is fully paid
	allPaid := true
	for _, r := range repayments {
		if r.Status != "paid" && r.ID != nextRepayment.ID {
			allPaid = false
			break
		}
	}

	if allPaid {
		loan.Status = models.LoanStatusPaidOff
		h.db.UpdateLoan(c.Request.Context(), loan)
	} else if loan.Status == models.LoanStatusDisbursed {
		loan.Status = models.LoanStatusActive
		h.db.UpdateLoan(c.Request.Context(), loan)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Payment processed successfully",
		"repayment": nextRepayment,
	})
}

// Helper functions

func (h *LoanHandler) calculateInterestRate(loanType models.LoanType, amount decimal.Decimal, termMonths int) decimal.Decimal {
	baseRate := decimal.NewFromFloat(15.0) // 15% base rate

	switch loanType {
	case models.LoanTypePersonal:
		baseRate = decimal.NewFromFloat(18.0)
	case models.LoanTypeBusiness:
		baseRate = decimal.NewFromFloat(16.0)
	case models.LoanTypeMortgage:
		baseRate = decimal.NewFromFloat(12.0)
	case models.LoanTypeAuto:
		baseRate = decimal.NewFromFloat(14.0)
	case models.LoanTypeEducation:
		baseRate = decimal.NewFromFloat(10.0)
	case models.LoanTypeEmergency:
		baseRate = decimal.NewFromFloat(20.0)
	}

	// Adjust for amount
	if amount.GreaterThan(decimal.NewFromInt(1000000)) {
		baseRate = baseRate.Sub(decimal.NewFromFloat(1.0))
	}

	// Adjust for term
	if termMonths > 60 {
		baseRate = baseRate.Add(decimal.NewFromFloat(0.5))
	}

	return baseRate
}

func (h *LoanHandler) calculateRiskScore(loan *models.LoanApplication) decimal.Decimal {
	score := decimal.NewFromFloat(50.0) // Base score

	// DTI ratio impact
	if loan.DebtToIncomeRatio.GreaterThan(decimal.NewFromFloat(40)) {
		score = score.Add(decimal.NewFromFloat(20))
	} else if loan.DebtToIncomeRatio.LessThan(decimal.NewFromFloat(20)) {
		score = score.Sub(decimal.NewFromFloat(15))
	}

	// Employment status impact
	switch loan.EmploymentStatus {
	case "employed":
		score = score.Sub(decimal.NewFromFloat(10))
	case "self_employed":
		score = score.Add(decimal.NewFromFloat(5))
	case "unemployed":
		score = score.Add(decimal.NewFromFloat(25))
	}

	// Collateral impact
	if !loan.CollateralValue.IsZero() {
		collateralRatio := loan.CollateralValue.Div(loan.Amount)
		if collateralRatio.GreaterThan(decimal.NewFromFloat(1.5)) {
			score = score.Sub(decimal.NewFromFloat(15))
		} else if collateralRatio.GreaterThan(decimal.NewFromFloat(1.0)) {
			score = score.Sub(decimal.NewFromFloat(10))
		}
	}

	// Ensure score is between 0 and 100
	if score.LessThan(decimal.Zero) {
		score = decimal.Zero
	}
	if score.GreaterThan(decimal.NewFromInt(100)) {
		score = decimal.NewFromInt(100)
	}

	return score
}

func (h *LoanHandler) calculateLoanTerms(loan *models.LoanApplication) {
	// Calculate monthly payment using amortization formula
	principal := loan.ApprovedAmount
	annualRate := loan.InterestRate.Div(decimal.NewFromInt(100))
	monthlyRate := annualRate.Div(decimal.NewFromInt(12))
	n := decimal.NewFromInt(int64(loan.TermMonths))

	// Monthly payment = P * [r(1+r)^n] / [(1+r)^n - 1]
	if monthlyRate.IsZero() {
		loan.MonthlyPayment = principal.Div(n)
	} else {
		r := monthlyRate.InexactFloat64()
		nFloat := float64(loan.TermMonths)
		p := principal.InexactFloat64()

		numerator := r * math.Pow(1+r, nFloat)
		denominator := math.Pow(1+r, nFloat) - 1
		monthlyPayment := p * (numerator / denominator)

		loan.MonthlyPayment = decimal.NewFromFloat(monthlyPayment).Round(2)
	}

	loan.TotalRepayment = loan.MonthlyPayment.Mul(n)
	loan.TotalInterest = loan.TotalRepayment.Sub(principal)
}

func (h *LoanHandler) generateRepaymentSchedule(loan *models.LoanApplication) *models.LoanSchedule {
	schedule := &models.LoanSchedule{
		LoanID:         loan.ID,
		TotalPayments:  loan.TermMonths,
		MonthlyPayment: loan.MonthlyPayment,
		TotalPrincipal: loan.ApprovedAmount,
		TotalInterest:  loan.TotalInterest,
		TotalRepayment: loan.TotalRepayment,
	}

	balance := loan.ApprovedAmount
	monthlyRate := loan.InterestRate.Div(decimal.NewFromInt(1200))
	startDate := time.Now().AddDate(0, 1, 0)

	var payments []models.LoanRepayment
	for i := 1; i <= loan.TermMonths; i++ {
		interestDue := balance.Mul(monthlyRate).Round(2)
		principalDue := loan.MonthlyPayment.Sub(interestDue)
		
		if i == loan.TermMonths {
			// Last payment - adjust for rounding
			principalDue = balance
		}

		payment := models.LoanRepayment{
			ID:            uuid.New(),
			LoanID:        loan.ID,
			PaymentNumber: i,
			DueDate:       startDate.AddDate(0, i-1, 0),
			PrincipalDue:  principalDue,
			InterestDue:   interestDue,
			TotalDue:      principalDue.Add(interestDue),
			Status:        "pending",
			CreatedAt:     time.Now(),
		}

		payments = append(payments, payment)
		balance = balance.Sub(principalDue)
	}

	// Convert to pointer slice for database
	paymentPtrs := make([]*models.LoanRepayment, len(payments))
	for i := range payments {
		paymentPtrs[i] = &payments[i]
	}

	schedule.Payments = payments
	return schedule
}
