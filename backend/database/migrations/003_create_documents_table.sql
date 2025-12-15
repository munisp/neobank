-- Migration: Create documents table for document management
-- Date: 2025-10-31
-- Description: Stores document metadata and OCR results

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    document_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    filename VARCHAR(512) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    ocr_text TEXT,
    ocr_confidence DECIMAL(5, 4),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_document_type CHECK (document_type IN (
        'identity', 'proof_of_address', 'selfie', 'bank_statement',
        'tax_document', 'contract', 'invoice', 'receipt', 'other'
    )),
    CONSTRAINT chk_status CHECK (status IN (
        'pending', 'processing', 'processed', 'failed', 'rejected', 'approved'
    )),
    CONSTRAINT chk_file_size CHECK (file_size > 0 AND file_size <= 10485760), -- Max 10MB
    CONSTRAINT chk_ocr_confidence CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1))
);

-- Create indexes for performance
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_user_type ON documents(user_id, document_type);
CREATE INDEX idx_documents_user_status ON documents(user_id, status);

-- Full-text search index on OCR text
CREATE INDEX idx_documents_ocr_text ON documents USING gin(to_tsvector('english', COALESCE(ocr_text, '')));

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- Create document statistics view
CREATE OR REPLACE VIEW document_statistics AS
SELECT 
    user_id,
    document_type,
    status,
    COUNT(*) as document_count,
    SUM(file_size) as total_size,
    AVG(ocr_confidence) as avg_ocr_confidence,
    MAX(created_at) as last_upload_date
FROM documents
GROUP BY user_id, document_type, status;

-- Create document retention policy function
CREATE OR REPLACE FUNCTION get_document_retention_days(doc_type VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE doc_type
        WHEN 'identity' THEN 2555  -- 7 years
        WHEN 'proof_of_address' THEN 1825  -- 5 years
        WHEN 'bank_statement' THEN 2555  -- 7 years
        WHEN 'tax_document' THEN 2555  -- 7 years
        WHEN 'contract' THEN 3650  -- 10 years
        ELSE 365  -- 1 year default
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to find expired documents
CREATE OR REPLACE FUNCTION find_expired_documents()
RETURNS TABLE (
    document_id VARCHAR,
    user_id VARCHAR,
    document_type VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE,
    retention_days INTEGER,
    days_old INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.document_id,
        d.user_id,
        d.document_type,
        d.created_at,
        get_document_retention_days(d.document_type) as retention_days,
        EXTRACT(DAY FROM (NOW() - d.created_at))::INTEGER as days_old
    FROM documents d
    WHERE EXTRACT(DAY FROM (NOW() - d.created_at)) > get_document_retention_days(d.document_type);
END;
$$ LANGUAGE plpgsql;

-- Create function to get document summary for user
CREATE OR REPLACE FUNCTION get_user_document_summary(p_user_id VARCHAR)
RETURNS TABLE (
    total_documents BIGINT,
    total_size BIGINT,
    pending_count BIGINT,
    processed_count BIGINT,
    failed_count BIGINT,
    avg_ocr_confidence DECIMAL,
    document_types JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_documents,
        SUM(file_size) as total_size,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'processed') as processed_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        AVG(ocr_confidence) as avg_ocr_confidence,
        jsonb_object_agg(
            document_type,
            jsonb_build_object(
                'count', type_count,
                'total_size', type_size
            )
        ) as document_types
    FROM (
        SELECT 
            document_type,
            COUNT(*) as type_count,
            SUM(file_size) as type_size
        FROM documents
        WHERE user_id = p_user_id
        GROUP BY document_type
    ) type_stats,
    documents
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO neobank_app;
GRANT SELECT ON document_statistics TO neobank_app;
GRANT EXECUTE ON FUNCTION get_document_retention_days(VARCHAR) TO neobank_app;
GRANT EXECUTE ON FUNCTION find_expired_documents() TO neobank_app;
GRANT EXECUTE ON FUNCTION get_user_document_summary(VARCHAR) TO neobank_app;

-- Add comments
COMMENT ON TABLE documents IS 'Stores document metadata and OCR results for KYC and compliance';
COMMENT ON COLUMN documents.document_id IS 'Unique document identifier';
COMMENT ON COLUMN documents.user_id IS 'User who uploaded the document';
COMMENT ON COLUMN documents.document_type IS 'Type of document (identity, proof_of_address, etc.)';
COMMENT ON COLUMN documents.ocr_text IS 'Extracted text from OCR processing';
COMMENT ON COLUMN documents.ocr_confidence IS 'OCR confidence score (0-1)';
COMMENT ON COLUMN documents.metadata IS 'Additional document metadata (JSON)';
COMMENT ON VIEW document_statistics IS 'Aggregated document statistics by user, type, and status';
COMMENT ON FUNCTION get_document_retention_days(VARCHAR) IS 'Returns retention period in days for document type';
COMMENT ON FUNCTION find_expired_documents() IS 'Finds documents that have exceeded their retention period';
COMMENT ON FUNCTION get_user_document_summary(VARCHAR) IS 'Returns comprehensive document summary for a user';
