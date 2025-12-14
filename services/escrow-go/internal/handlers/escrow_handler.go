package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"neobank/escrow-go/internal/models"
	"neobank/escrow-go/internal/service"
)

type EscrowHandler struct {
	service *service.EscrowService
}

func NewEscrowHandler(svc *service.EscrowService) *EscrowHandler {
	return &EscrowHandler{service: svc}
}

func (h *EscrowHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/escrows", h.CreateEscrow).Methods("POST")
	r.HandleFunc("/escrows", h.ListEscrows).Methods("GET")
	r.HandleFunc("/escrows/stats", h.GetStats).Methods("GET")
	r.HandleFunc("/escrows/templates", h.GetTemplates).Methods("GET")
	r.HandleFunc("/escrows/{id}", h.GetEscrow).Methods("GET")
	r.HandleFunc("/escrows/reference/{ref}", h.GetEscrowByReference).Methods("GET")
	r.HandleFunc("/escrows/{id}/fund", h.FundEscrow).Methods("POST")
	r.HandleFunc("/escrows/{id}/deliver", h.MarkDelivered).Methods("POST")
	r.HandleFunc("/escrows/{id}/inspect", h.StartInspection).Methods("POST")
	r.HandleFunc("/escrows/{id}/approve", h.ApproveRelease).Methods("POST")
	r.HandleFunc("/escrows/{id}/release", h.ReleaseFunds).Methods("POST")
	r.HandleFunc("/escrows/{id}/refund", h.RequestRefund).Methods("POST")
	r.HandleFunc("/escrows/{id}/cancel", h.CancelEscrow).Methods("POST")
	r.HandleFunc("/escrows/{id}/dispute", h.InitiateDispute).Methods("POST")
	r.HandleFunc("/escrows/{id}/dispute", h.GetDisputeByEscrow).Methods("GET")
	r.HandleFunc("/escrows/{id}/milestones", h.GetMilestones).Methods("GET")
	r.HandleFunc("/escrows/{id}/milestones/{milestoneId}/complete", h.CompleteMilestone).Methods("POST")
	r.HandleFunc("/escrows/{id}/milestones/{milestoneId}/approve", h.ApproveMilestone).Methods("POST")
	r.HandleFunc("/escrows/{id}/events", h.GetEvents).Methods("GET")
	
	r.HandleFunc("/disputes/{id}", h.GetDispute).Methods("GET")
	r.HandleFunc("/disputes/{id}/evidence", h.SubmitEvidence).Methods("POST")
	r.HandleFunc("/disputes/{id}/evidence", h.GetEvidence).Methods("GET")
	r.HandleFunc("/disputes/{id}/resolve", h.ResolveDispute).Methods("POST")
}

func (h *EscrowHandler) CreateEscrow(w http.ResponseWriter, r *http.Request) {
	var req service.CreateEscrowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.CreateEscrow(r.Context(), &req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, escrow)
}

func (h *EscrowHandler) GetEscrow(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	escrow, err := h.service.GetEscrow(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if escrow == nil {
		respondError(w, http.StatusNotFound, "Escrow not found")
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) GetEscrowByReference(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ref := vars["ref"]

	escrow, err := h.service.GetEscrowByReference(r.Context(), ref)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if escrow == nil {
		respondError(w, http.StatusNotFound, "Escrow not found")
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) ListEscrows(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("user_id")
	if userIDStr == "" {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user_id")
		return
	}

	role := r.URL.Query().Get("role")
	status := r.URL.Query().Get("status")
	escrowType := r.URL.Query().Get("type")

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	escrows, total, err := h.service.ListEscrows(r.Context(), userID, role, status, escrowType, page, pageSize)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"escrows": escrows,
		"total":   total,
		"page":    page,
		"page_size": pageSize,
	})
}

func (h *EscrowHandler) FundEscrow(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		Amount float64   `json:"amount"`
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.FundEscrow(r.Context(), escrowID, req.Amount, req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) MarkDelivered(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID         uuid.UUID `json:"user_id"`
		TrackingNumber string    `json:"tracking_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.MarkDelivered(r.Context(), escrowID, req.UserID, req.TrackingNumber)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) StartInspection(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.StartInspection(r.Context(), escrowID, req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) ApproveRelease(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.ApproveRelease(r.Context(), escrowID, req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) ReleaseFunds(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.ReleaseFunds(r.Context(), escrowID, req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) RequestRefund(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
		Reason string    `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.RequestRefund(r.Context(), escrowID, req.UserID, req.Reason)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) CancelEscrow(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
		Reason string    `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	escrow, err := h.service.CancelEscrow(r.Context(), escrowID, req.UserID, req.Reason)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, escrow)
}

func (h *EscrowHandler) InitiateDispute(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	var req struct {
		UserID      uuid.UUID `json:"user_id"`
		Reason      string    `json:"reason"`
		Description string    `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	dispute, err := h.service.InitiateDispute(r.Context(), escrowID, req.UserID, req.Reason, req.Description)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, dispute)
}

func (h *EscrowHandler) GetDisputeByEscrow(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	dispute, err := h.service.GetDisputeByEscrow(r.Context(), escrowID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dispute == nil {
		respondError(w, http.StatusNotFound, "No active dispute found")
		return
	}

	respondJSON(w, http.StatusOK, dispute)
}

func (h *EscrowHandler) GetDispute(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	disputeID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid dispute ID")
		return
	}

	dispute, err := h.service.GetDispute(r.Context(), disputeID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if dispute == nil {
		respondError(w, http.StatusNotFound, "Dispute not found")
		return
	}

	respondJSON(w, http.StatusOK, dispute)
}

func (h *EscrowHandler) SubmitEvidence(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	disputeID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid dispute ID")
		return
	}

	var req struct {
		UserID      uuid.UUID `json:"user_id"`
		Type        string    `json:"type"`
		Title       string    `json:"title"`
		Description string    `json:"description"`
		FileURL     string    `json:"file_url"`
		FileType    string    `json:"file_type"`
		FileSize    int64     `json:"file_size"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	evidence, err := h.service.SubmitEvidence(r.Context(), disputeID, req.UserID, req.Type, req.Title, req.Description, req.FileURL, req.FileType, req.FileSize)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, evidence)
}

func (h *EscrowHandler) GetEvidence(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	disputeID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid dispute ID")
		return
	}

	evidence, err := h.service.GetEvidenceByDispute(r.Context(), disputeID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, evidence)
}

func (h *EscrowHandler) ResolveDispute(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	disputeID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid dispute ID")
		return
	}

	var req struct {
		ArbitratorID uuid.UUID                `json:"arbitrator_id"`
		Resolution   models.DisputeResolution `json:"resolution"`
		Notes        string                   `json:"notes"`
		BuyerAmount  float64                  `json:"buyer_amount"`
		SellerAmount float64                  `json:"seller_amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	dispute, err := h.service.ResolveDispute(r.Context(), disputeID, req.ArbitratorID, req.Resolution, req.Notes, req.BuyerAmount, req.SellerAmount)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, dispute)
}

func (h *EscrowHandler) GetMilestones(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	milestones, err := h.service.GetMilestones(r.Context(), escrowID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, milestones)
}

func (h *EscrowHandler) CompleteMilestone(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	milestoneID, err := uuid.Parse(vars["milestoneId"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid milestone ID")
		return
	}

	var req struct {
		UserID   uuid.UUID `json:"user_id"`
		Evidence []string  `json:"evidence"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	milestone, err := h.service.CompleteMilestone(r.Context(), escrowID, milestoneID, req.UserID, req.Evidence)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, milestone)
}

func (h *EscrowHandler) ApproveMilestone(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	milestoneID, err := uuid.Parse(vars["milestoneId"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid milestone ID")
		return
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	milestone, err := h.service.ApproveMilestone(r.Context(), escrowID, milestoneID, req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, milestone)
}

func (h *EscrowHandler) GetEvents(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	escrowID, err := uuid.Parse(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid escrow ID")
		return
	}

	events, err := h.service.GetEvents(r.Context(), escrowID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, events)
}

func (h *EscrowHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("user_id")
	var userID *uuid.UUID
	if userIDStr != "" {
		id, err := uuid.Parse(userIDStr)
		if err == nil {
			userID = &id
		}
	}

	stats, err := h.service.GetStats(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, stats)
}

func (h *EscrowHandler) GetTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := h.service.GetTemplates(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, templates)
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
