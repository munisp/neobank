# NeoBank DeepSeek OCR + Docling Integration Architecture

**Version**: 1.0.0  
**Date**: 2025-12-03  
**Status**: Design Complete

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         NeoBank Platform                                │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Frontend Applications                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │  │
│  │  │   Web    │  │  Mobile  │  │   PWA    │  │ KYC/KYB  │       │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     API Gateway (Go)                             │  │
│  │                    (Existing Backend)                            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│         ┌──────────────────────┼──────────────────────┐               │
│         ▼                      ▼                      ▼               │
│  ┌─────────────┐        ┌─────────────┐      ┌─────────────┐         │
│  │  KYC/KYB    │        │    Loan     │      │  Compliance │         │
│  │  Services   │        │   Service   │      │   Service   │         │
│  └─────────────┘        └─────────────┘      └─────────────┘         │
│         │                      │                      │               │
│         └──────────────────────┼──────────────────────┘               │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │              Document Intelligence Service (NEW)                 │  │
│  │  ┌───────────────────────────────────────────────────────────┐  │  │
│  │  │                   Go Integration Layer                     │  │  │
│  │  │  • REST API Handler                                        │  │  │
│  │  │  • Job Queue Manager (Redis)                               │  │  │
│  │  │  • Result Cache                                            │  │  │
│  │  │  • Error Handling & Retry Logic                            │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  │                                │                                  │  │
│  │                                ▼                                  │  │
│  │  ┌───────────────────────────────────────────────────────────┐  │  │
│  │  │              Python Processing Service                     │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  Docling DocumentConverter                          │  │  │  │
│  │  │  │  • Multi-format support (PDF, DOCX, images)         │  │  │  │
│  │  │  │  • Layout analysis                                   │  │  │  │
│  │  │  │  • Table extraction                                  │  │  │  │
│  │  │  │  • Export to Markdown/JSON                           │  │  │  │
│  │  │  └─────────────────────────────────────────────────────┘  │  │  │
│  │  │                                │                            │  │  │
│  │  │                                ▼                            │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  DeepSeek OCR VLM Pipeline                          │  │  │  │
│  │  │  │  • Context-aware OCR                                 │  │  │  │
│  │  │  │  • 7-20x token compression                           │  │  │  │
│  │  │  │  • 97% precision                                     │  │  │  │
│  │  │  │  • Multi-page processing                             │  │  │  │
│  │  │  └─────────────────────────────────────────────────────┘  │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Document Storage Layer                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │  │
│  │  │  PostgreSQL  │  │    MinIO     │  │    Redis     │          │  │
│  │  │  (Metadata)  │  │  (Files)     │  │  (Cache)     │          │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Go Integration Layer

**Purpose**: Bridge between existing backend services and Python processing service

**Responsibilities**:
- Receive document upload requests
- Manage async job processing
- Cache results for fast retrieval
- Handle errors and retries
- Provide REST API for backend services

**Technology Stack**:
- Go 1.21+
- go-resty/resty (HTTP client)
- go-redis/redis (caching)
- google/uuid (job IDs)

**API Endpoints**:
```go
POST   /api/v1/documents/parse          // Submit document for parsing
GET    /api/v1/documents/status/:job_id // Check parsing status
GET    /api/v1/documents/result/:job_id // Retrieve parsed result
POST   /api/v1/documents/batch          // Batch processing
DELETE /api/v1/documents/:job_id        // Cancel job
```

**Data Structures**:
```go
type ParseRequest struct {
    DocumentID   string            `json:"document_id"`
    DocumentType string            `json:"document_type"` // "kyc_id", "bank_statement", etc.
    FileURL      string            `json:"file_url"`
    Options      map[string]string `json:"options"`
}

type ParseResponse struct {
    JobID     string    `json:"job_id"`
    Status    string    `json:"status"` // "queued", "processing", "completed", "failed"
    CreatedAt time.Time `json:"created_at"`
}

type ParseResult struct {
    JobID        string                 `json:"job_id"`
    Status       string                 `json:"status"`
    DocumentID   string                 `json:"document_id"`
    ExtractedText string                `json:"extracted_text"`
    Markdown     string                 `json:"markdown"`
    Metadata     map[string]interface{} `json:"metadata"`
    Tables       []Table                `json:"tables"`
    Images       []Image                `json:"images"`
    Confidence   float64                `json:"confidence"`
    ProcessingTime int64                `json:"processing_time_ms"`
    Error        string                 `json:"error,omitempty"`
}
```

---

### 2. Python Processing Service

**Purpose**: Core document processing using Docling and DeepSeek OCR

**Responsibilities**:
- Parse documents using Docling
- Extract text with DeepSeek OCR
- Analyze layout and structure
- Extract tables and images
- Export to multiple formats

**Technology Stack**:
- Python 3.11+
- Docling 2.64+
- FastAPI 0.100+
- Transformers 4.30+
- PyTorch 2.0+

**API Endpoints**:
```python
POST   /v1/parse          # Parse document
GET    /v1/status/{job_id} # Job status
GET    /v1/result/{job_id} # Get result
POST   /v1/batch          # Batch processing
GET    /v1/health         # Health check
```

**Service Structure**:
```python
from fastapi import FastAPI, UploadFile
from docling.document_converter import DocumentConverter
from docling.pipeline.vlm_pipeline import VlmPipeline

app = FastAPI()

class DeepSeekOCRVLM(VlmPipeline):
    """Custom VLM implementation for DeepSeek OCR"""
    pass

class DocumentProcessor:
    def __init__(self):
        self.converter = DocumentConverter(
            vlm_pipeline=DeepSeekOCRVLM()
        )
    
    async def process(self, file: UploadFile, options: dict):
        # Process document
        result = self.converter.convert(file)
        return {
            "text": result.document.export_to_text(),
            "markdown": result.document.export_to_markdown(),
            "json": result.document.export_to_json(),
            "metadata": self.extract_metadata(result)
        }
```

---

### 3. DeepSeek OCR VLM Pipeline

**Purpose**: Custom VLM implementation integrating DeepSeek OCR with Docling

**Implementation Options**:

**Option A: Local Model (Recommended for Production)**
```python
from transformers import AutoModel, AutoTokenizer
import torch

class DeepSeekOCRVLM(VlmPipeline):
    def __init__(self, model_name="deepseek-ai/DeepSeek-OCR"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = AutoModel.from_pretrained(
            model_name,
            trust_remote_code=True
        ).to(self.device)
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    def process_page(self, image, prompt=None):
        """Process single page with DeepSeek OCR"""
        inputs = self.tokenizer(
            images=image,
            text=prompt or "Extract all text",
            return_tensors="pt"
        ).to(self.device)
        
        with torch.no_grad():
            outputs = self.model.generate(**inputs)
        
        text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return text
    
    def process_document(self, pages):
        """Process multi-page document"""
        results = []
        for page in pages:
            text = self.process_page(page)
            results.append(text)
        return "\n\n".join(results)
```

**Option B: API Integration (For Testing/Development)**
```python
import requests
import os

class DeepSeekOCRAPI(VlmPipeline):
    def __init__(self):
        self.api_key = os.getenv("DEEPSEEK_OCR_API_KEY")
        self.base_url = "https://api.deepsee-ocr.ai"
    
    def process_page(self, image_path, prompt=None):
        """Process via DeepSeek OCR API"""
        url = f"{self.base_url}/v1/ocr"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        files = {"file": open(image_path, "rb")}
        data = {"prompt": prompt} if prompt else {}
        
        response = requests.post(url, headers=headers, files=files, data=data)
        response.raise_for_status()
        return response.json()["text"]
```

---

### 4. Document Storage Layer

**PostgreSQL Schema**:
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id VARCHAR(255) UNIQUE NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    job_id VARCHAR(255) UNIQUE NOT NULL,
    extracted_text TEXT,
    markdown TEXT,
    metadata JSONB,
    tables JSONB,
    images JSONB,
    confidence DECIMAL(5,4),
    processing_time_ms INTEGER,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE document_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_value TEXT,
    confidence DECIMAL(5,4),
    bounding_box JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (extraction_id) REFERENCES document_extractions(id) ON DELETE CASCADE
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_extractions_document_id ON document_extractions(document_id);
CREATE INDEX idx_extractions_job_id ON document_extractions(job_id);
CREATE INDEX idx_fields_extraction_id ON document_fields(extraction_id);
```

**MinIO Storage**:
- Bucket: `neobank-documents`
- Structure: `{user_id}/{document_type}/{document_id}/original.{ext}`
- Retention: 7 years (compliance requirement)

**Redis Cache**:
- Key pattern: `doc:result:{job_id}`
- TTL: 1 hour
- Value: JSON-serialized ParseResult

---

## Data Flow

### Document Upload & Processing

```
1. Client uploads document
   ↓
2. Go Integration Layer receives request
   ↓
3. Generate job_id and store in Redis (status: queued)
   ↓
4. Upload file to MinIO
   ↓
5. Insert record in PostgreSQL documents table
   ↓
6. Send to Python Processing Service via HTTP
   ↓
7. Python service processes with Docling + DeepSeek OCR
   ↓
8. Extract text, tables, metadata
   ↓
9. Store extraction in PostgreSQL document_extractions table
   ↓
10. Cache result in Redis
   ↓
11. Update status in Redis (status: completed)
   ↓
12. Go Integration Layer polls or receives webhook
   ↓
13. Return result to calling service (KYC, Loan, etc.)
```

### Async Job Processing

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /parse
       ▼
┌─────────────────────┐
│  Go Integration     │
│  Layer              │
│  1. Generate job_id │
│  2. Queue job       │
│  3. Return job_id   │
└──────┬──────────────┘
       │ 202 Accepted
       │ {job_id: "xxx"}
       ▼
┌─────────────┐
│   Client    │ ◄─── Polls GET /status/{job_id}
└─────────────┘

Meanwhile:
┌─────────────────────┐
│  Background Worker  │
│  1. Dequeue job     │
│  2. Call Python     │
│  3. Store result    │
│  4. Update status   │
└─────────────────────┘
```

---

## Integration Points

### 1. KYC/KYB Services

**Document Types**:
- ID cards (passport, driver's license, national ID)
- Utility bills (proof of address)
- Business registration documents
- Tax documents
- Bank statements

**Integration**:
```go
// In KYC service
func (s *KYCService) VerifyDocument(ctx context.Context, userID, documentType string, file []byte) error {
    // Upload to document intelligence service
    result, err := s.docClient.ParseDocument(ctx, &docint.ParseRequest{
        DocumentID:   uuid.New().String(),
        DocumentType: documentType,
        FileURL:      uploadedURL,
        Options: map[string]string{
            "extract_fields": "name,dob,address,id_number",
            "language": "en",
        },
    })
    
    // Extract fields
    fields := s.extractKYCFields(result)
    
    // Verify against user data
    return s.verifyFields(userID, fields)
}
```

### 2. Loan Services

**Document Types**:
- Income statements
- Employment verification letters
- Property documents
- Credit reports
- Financial statements

**Integration**:
```go
// In Loan service
func (s *LoanService) ProcessApplication(ctx context.Context, applicationID string, documents []Document) error {
    for _, doc := range documents {
        result, err := s.docClient.ParseDocument(ctx, &docint.ParseRequest{
            DocumentID:   doc.ID,
            DocumentType: doc.Type,
            FileURL:      doc.URL,
            Options: map[string]string{
                "extract_tables": "true",
                "extract_amounts": "true",
            },
        })
        
        // Extract financial data
        income := s.extractIncome(result)
        
        // Update application
        s.updateApplication(applicationID, income)
    }
    
    return nil
}
```

### 3. Compliance Services

**Document Types**:
- Regulatory filings
- Audit reports
- Contracts
- Policy documents

**Integration**:
```go
// In Compliance service
func (s *ComplianceService) AnalyzeDocument(ctx context.Context, documentID string) (*ComplianceReport, error) {
    result, err := s.docClient.ParseDocument(ctx, &docint.ParseRequest{
        DocumentID:   documentID,
        DocumentType: "compliance_doc",
        FileURL:      documentURL,
        Options: map[string]string{
            "extract_metadata": "true",
            "detect_pii": "true",
        },
    })
    
    // Analyze for compliance
    report := s.analyzeCompliance(result)
    
    return report, nil
}
```

---

## Performance Specifications

### Throughput

**Target**: 1,000 documents/hour per instance
- Single page: 2-5 seconds
- Multi-page (10 pages): 20-50 seconds
- Batch processing: 100 documents in parallel

### Latency

**API Response Times**:
- Submit job: < 100ms (synchronous)
- Status check: < 50ms (cached)
- Result retrieval: < 200ms (cached)

**Processing Times**:
- Simple document (1-2 pages): 2-5 seconds
- Complex document (10+ pages): 20-50 seconds
- Scanned/image-heavy: 5-10 seconds per page

### Scalability

**Horizontal Scaling**:
- Go Integration Layer: 3-10 instances
- Python Processing Service: 5-20 instances
- Redis: 3-node cluster
- PostgreSQL: Primary + 2 replicas

**Resource Requirements per Instance**:
- Go: 1 CPU, 512MB RAM
- Python: 4 CPU, 8GB RAM (16GB with GPU)
- Redis: 2 CPU, 4GB RAM
- PostgreSQL: 4 CPU, 16GB RAM

---

## Security Considerations

### Data Protection

**Encryption**:
- TLS 1.3 for all API communications
- AES-256 for data at rest (MinIO)
- Field-level encryption for PII

**Access Control**:
- JWT authentication for API access
- Service-to-service mTLS
- Role-based access control (RBAC)
- Audit logging for all operations

### Compliance

**GDPR**:
- Right to erasure (document deletion)
- Data minimization (only extract necessary fields)
- Consent management
- Data portability (export to JSON)

**PCI-DSS**:
- Secure document handling
- No storage of card data in plain text
- Access logging and monitoring
- Regular security audits

**SOC 2**:
- Access controls
- Audit trails
- Incident response
- Change management

### Privacy

**Local Execution**:
- Option to run DeepSeek OCR locally (no external API)
- Air-gapped deployment support
- No data sent to third parties

**Data Retention**:
- Original documents: 7 years (compliance)
- Extracted data: 7 years (compliance)
- Temporary files: Deleted after processing
- Cache: 1 hour TTL

---

## Monitoring & Observability

### Metrics

**Application Metrics**:
```
# Processing metrics
doc_processing_duration_seconds{document_type}
doc_processing_total{status,document_type}
doc_queue_depth
doc_cache_hit_ratio

# API metrics
api_requests_total{endpoint,method,status}
api_request_duration_seconds{endpoint}
api_errors_total{endpoint,error_type}

# Resource metrics
python_memory_usage_bytes
python_cpu_usage_percent
go_goroutines_count
redis_connected_clients
```

**Business Metrics**:
```
documents_processed_total{document_type}
extraction_accuracy{document_type}
manual_review_rate{document_type}
cost_per_document{document_type}
```

### Logging

**Structured Logging**:
```json
{
  "timestamp": "2025-12-03T14:30:00Z",
  "level": "INFO",
  "service": "document-intelligence",
  "component": "python-processor",
  "job_id": "abc123",
  "document_id": "doc456",
  "document_type": "kyc_passport",
  "event": "processing_started",
  "user_id": "user789",
  "processing_time_ms": 3500,
  "confidence": 0.97
}
```

### Alerting

**Critical Alerts**:
- Service downtime (> 1 minute)
- High error rate (> 5%)
- Processing delays (> 5 minutes)
- Low disk space (< 10%)

**Warning Alerts**:
- Accuracy degradation (< 90%)
- High queue depth (> 100)
- Slow processing (> 60 seconds/doc)
- Cache miss rate (> 50%)

---

## Deployment Strategy

### Kubernetes Deployment

**Namespaces**:
- `document-intelligence-prod`
- `document-intelligence-staging`

**Services**:
```yaml
# Go Integration Layer
apiVersion: apps/v1
kind: Deployment
metadata:
  name: doc-intelligence-go
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: go-service
        image: neobank/doc-intelligence-go:v1.0.0
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi

# Python Processing Service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: doc-intelligence-python
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: python-service
        image: neobank/doc-intelligence-python:v1.0.0
        resources:
          requests:
            cpu: 2000m
            memory: 8Gi
          limits:
            cpu: 4000m
            memory: 16Gi
```

### CI/CD Pipeline

**Stages**:
1. **Build**: Docker images for Go and Python services
2. **Test**: Unit tests, integration tests
3. **Security Scan**: Trivy, Snyk
4. **Deploy Staging**: Automated deployment
5. **E2E Tests**: Real document processing
6. **Deploy Production**: Manual approval

---

## Cost Estimation

### Infrastructure Costs (Monthly)

**Compute**:
- Go instances (3x): $150
- Python instances (5x): $1,500
- Redis cluster: $300
- PostgreSQL: $500
**Total Compute**: $2,450/month

**Storage**:
- MinIO (10TB): $200
- PostgreSQL storage (500GB): $100
**Total Storage**: $300/month

**Network**:
- Data transfer: $100
**Total Network**: $100/month

**Total Infrastructure**: $2,850/month

### Operational Costs

**DeepSeek OCR**:
- Option A (Local): $0 (included in compute)
- Option B (API): $0.001/page × 500,000 pages = $500/month

**Monitoring**:
- Prometheus/Grafana: $200/month

**Total Monthly Cost**: $3,050 - $3,550/month

### Cost per Document

**Assumptions**:
- 10,000 documents/month
- 5 pages average per document
- 50,000 pages/month

**Cost per Document**: $0.06 - $0.07

**vs Manual Processing**: $10/document (150x savings)

---

## Success Metrics

### Technical KPIs

- **Accuracy**: > 95% OCR precision
- **Latency**: < 5 seconds per page (p95)
- **Throughput**: 1,000 documents/hour
- **Uptime**: 99.9% availability
- **Error Rate**: < 1%

### Business KPIs

- **Processing Time**: 80% reduction vs manual
- **Cost Savings**: $200,000/month
- **Customer Satisfaction**: > 4.5/5
- **Manual Review Rate**: < 10%
- **Compliance**: 100% audit pass rate

---

## Risks & Mitigation

### Technical Risks

**Risk**: DeepSeek OCR model size (large memory footprint)
**Mitigation**: Use model quantization, GPU acceleration, or API fallback

**Risk**: Processing delays during high load
**Mitigation**: Auto-scaling, queue management, priority processing

**Risk**: Accuracy issues with poor quality scans
**Mitigation**: Image preprocessing, quality checks, manual review fallback

### Operational Risks

**Risk**: Service downtime affecting KYC/Loan processing
**Mitigation**: High availability, redundancy, graceful degradation

**Risk**: Data privacy concerns
**Mitigation**: Local execution, encryption, audit logging

**Risk**: Cost overruns
**Mitigation**: Usage monitoring, cost alerts, optimization

---

## Implementation Timeline

### Phase 1: Foundation (Week 1-2)
- Set up Python service with Docling
- Implement DeepSeek OCR VLM
- Create basic REST API

### Phase 2: Integration (Week 3-4)
- Build Go integration layer
- Implement job queue
- Add caching and storage

### Phase 3: Testing (Week 5-6)
- Unit and integration tests
- Performance testing
- Security audit

### Phase 4: Deployment (Week 7-8)
- Staging deployment
- E2E testing with real documents
- Production rollout

**Total Timeline**: 8 weeks

---

**Architecture Version**: 1.0.0  
**Last Updated**: 2025-12-03  
**Status**: Ready for Implementation
