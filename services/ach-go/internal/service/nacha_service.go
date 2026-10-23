package service

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/moov-io/ach"
)

// NachaService wraps moov-io/ach — the reference NACHA implementation —
// to generate, validate and parse ACH files for the Python core.

type EntryRequest struct {
	TransactionCode   int    `json:"transaction_code"`   // 22=credit DDA, 27=debit DDA, ...
	RoutingNumber     string `json:"routing_number"`     // 9 digits
	AccountNumber     string `json:"account_number"`
	AmountCents       int64  `json:"amount_cents"`
	Identification    string `json:"identification,omitempty"`
	RecipientName     string `json:"recipient_name"`
	DiscretionaryData string `json:"discretionary_data,omitempty"`
}

type GenerateRequest struct {
	SECCode             string         `json:"sec_code"` // PPD | CCD | WEB | TEL
	CompanyName         string         `json:"company_name"`
	CompanyID           string         `json:"company_id"`          // 10 chars
	CompanyDescription  string         `json:"company_description"` // e.g. PAYROLL
	EffectiveDate       string         `json:"effective_date"`      // YYMMDD or RFC3339
	ServiceClassCode    int            `json:"service_class_code"`  // 200 mixed, 220 credits, 225 debits
	Entries             []EntryRequest `json:"entries"`
}

type GenerateResponse struct {
	File          string   `json:"file"`
	Valid         bool     `json:"valid"`
	Errors        []string `json:"errors,omitempty"`
	EntryCount    int      `json:"entry_count"`
	TotalCredits  int64    `json:"total_credits"`
	TotalDebits   int64    `json:"total_debits"`
	TraceNumbers  []string `json:"trace_numbers"`
}

type ParsedReturn struct {
	TraceNumber   string `json:"trace_number"`
	ReturnCode    string `json:"return_code"`
	Reason        string `json:"reason"`
	AmountCents   int64  `json:"amount_cents"`
	AccountNumber string `json:"account_number"`
}

type ParseResponse struct {
	Batches    int            `json:"batches"`
	Entries    int            `json:"entries"`
	Returns    []ParsedReturn `json:"returns"`
	TotalCreds int64          `json:"total_credits"`
	TotalDebs  int64          `json:"total_debits"`
	Valid      bool           `json:"valid"`
	Errors     []string       `json:"errors,omitempty"`
}

type NachaService struct {
	immediateDestination string
	immediateOrigin      string
	destinationName      string
	originName           string
}

func NewNachaService(dest, origin, destName, originName string) *NachaService {
	return &NachaService{
		immediateDestination: dest,
		immediateOrigin:      origin,
		destinationName:      destName,
		originName:           originName,
	}
}

func effectiveDateYYMMDD(raw string) string {
	if len(raw) == 6 {
		return raw
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.Format("060102")
	}
	return time.Now().Format("060102")
}

// Generate builds a NACHA file via moov-io/ach and validates it.
// moov computes entry/addenda hashes, control totals and 10-record
// blocking correctly — the defects in the old hand-rolled generator.
func (s *NachaService) Generate(req GenerateRequest) (*GenerateResponse, error) {
	if req.SECCode == "" {
		req.SECCode = ach.PPD
	}
	if req.ServiceClassCode == 0 {
		req.ServiceClassCode = ach.MixedCreditsAndDebits
	}

	file := ach.NewFile()
	fh := ach.NewFileHeader()
	fh.ImmediateDestination = s.immediateDestination
	fh.ImmediateOrigin = s.immediateOrigin
	fh.FileCreationDate = time.Now().Format("060102")
	fh.FileCreationTime = time.Now().Format("1504")
	fh.FileIDModifier = "A"
	fh.ImmediateDestinationName = s.destinationName
	fh.ImmediateOriginName = s.originName
	file.Header = fh

	bh := ach.NewBatchHeader()
	bh.ServiceClassCode = req.ServiceClassCode
	bh.CompanyName = req.CompanyName
	bh.CompanyIdentification = req.CompanyID
	bh.StandardEntryClassCode = req.SECCode
	bh.CompanyEntryDescription = req.CompanyDescription
	bh.EffectiveEntryDate = effectiveDateYYMMDD(req.EffectiveDate)
	bh.ODFIIdentification = s.immediateOrigin[:8]

	batch, err := ach.NewBatch(bh)
	if err != nil {
		return nil, fmt.Errorf("batch header: %w", err)
	}

	resp := &GenerateResponse{}
	for i, e := range req.Entries {
		ed := ach.NewEntryDetail()
		ed.TransactionCode = e.TransactionCode
		ed.RDFIIdentification = e.RoutingNumber[:8]
		ed.CheckDigit = e.RoutingNumber[8:9]
		ed.DFIAccountNumber = e.AccountNumber
		ed.Amount = e.AmountCents
		ed.IdentificationNumber = e.Identification
		ed.IndividualName = e.RecipientName
		ed.DiscretionaryData = e.DiscretionaryData
		ed.SetTraceNumber(bh.ODFIIdentification, i+1)
		batch.AddEntry(ed)
		resp.TraceNumbers = append(resp.TraceNumbers, ed.TraceNumber)
		if ed.TransactionCode >= 20 && ed.TransactionCode <= 29 {
			resp.TotalCredits += e.AmountCents
		} else {
			resp.TotalDebits += e.AmountCents
		}
	}

	if err := batch.Build(); err != nil {
		return nil, fmt.Errorf("batch build: %w", err)
	}
	file.AddBatch(batch)
	if err := file.Build(); err != nil {
		return nil, fmt.Errorf("file build: %w", err)
	}

	var buf bytes.Buffer
	if err := ach.NewWriter(&buf).Write(file); err != nil {
		return nil, fmt.Errorf("file write: %w", err)
	}
	resp.File = buf.String()
	resp.EntryCount = len(req.Entries)

	if err := file.Validate(); err != nil {
		resp.Valid = false
		resp.Errors = append(resp.Errors, err.Error())
	} else {
		resp.Valid = true
	}
	return resp, nil
}

// Validate parses and validates an inbound NACHA file (returns, NOCs,
// incoming entries). moov checks control totals and hashes.
func (s *NachaService) Validate(content string) (*ParseResponse, error) {
	file, err := ach.NewReader(strings.NewReader(content)).Read()
	if err != nil {
		return &ParseResponse{Valid: false, Errors: []string{err.Error()}}, nil
	}
	resp := s.describe(file)
	if err := file.Validate(); err != nil {
		resp.Valid = false
		resp.Errors = append(resp.Errors, err.Error())
	} else {
		resp.Valid = true
	}
	return resp, nil
}

// Parse returns the structured contents of a NACHA file — crucially the
// returns (Addenda99) so the core can auto-process rejected transfers.
func (s *NachaService) Parse(content string) (*ParseResponse, error) {
	file, err := ach.NewReader(strings.NewReader(content)).Read()
	if err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}
	return s.describe(file), nil
}

func (s *NachaService) describe(file *ach.File) *ParseResponse {
	resp := &ParseResponse{Valid: true}
	for _, b := range file.Batches {
		resp.Batches++
		entries := b.GetEntries()
		resp.Entries += len(entries)
		for _, ed := range entries {
			if ed.TransactionCode >= 20 && ed.TransactionCode <= 29 {
				resp.TotalCreds += ed.Amount
			} else {
				resp.TotalDebs += ed.Amount
			}
			if a99 := ed.GetAddenda99(); a99 != nil {
				reason := ""
				if rc := ach.LookupReturnCode(a99.ReturnCode); rc != nil {
					reason = rc.Description
				}
				resp.Returns = append(resp.Returns, ParsedReturn{
					TraceNumber:   a99.OriginalTrace,
					ReturnCode:    a99.ReturnCode,
					Reason:        reason,
					AmountCents:   ed.Amount,
					AccountNumber: ed.DFIAccountNumber,
				})
			}
		}
	}
	return resp
}
