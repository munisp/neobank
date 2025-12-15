"""
Test Suite for DeepSeek-OCR Integration
Tests for OCR service, document management, and KYC integration
"""

import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
import io
from PIL import Image

# Import services to test
from app.services.deepseek_ocr_service import (
    DeepSeekOCRService,
    DeepSeekOCRConfig,
    OCRResult,
    get_ocr_service
)
from app.services.document_management_service import (
    DocumentManagementService,
    Document,
    DocumentType,
    DocumentStatus
)
from app.services.deepseek_kyc_integration import DeepSeekKYCIntegration


class TestDeepSeekOCRService:
    """Test DeepSeek-OCR Service"""
    
    @pytest.mark.asyncio
    async def test_ocr_service_initialization(self):
        """Test OCR service initialization"""
        service = DeepSeekOCRService()
        
        assert service.config is not None
        assert service.config.model_name == "deepseek-ai/DeepSeek-OCR"
        assert "document" in service.config.prompts
        assert len(service.config.supported_languages) > 50
    
    @pytest.mark.asyncio
    async def test_process_image_with_mock_api(self):
        """Test image processing with mocked API"""
        service = DeepSeekOCRService()
        service.model_loaded = True
        
        # Create mock client
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json = Mock(return_value={
            "choices": [{
                "message": {
                    "content": "This is extracted text from the document."
                }
            }],
            "usage": {
                "total_tokens": 150
            }
        })
        
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        service.client = mock_client
        
        # Create test image
        img = Image.new('RGB', (100, 100), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        image_data = img_bytes.getvalue()
        
        # Process image
        result = await service.process_image(image_data, prompt_type="document")
        
        assert isinstance(result, OCRResult)
        assert result.text == "This is extracted text from the document."
        assert result.confidence > 0
        assert result.language is not None
    
    @pytest.mark.asyncio
    async def test_process_image_fallback(self):
        """Test fallback OCR when API is unavailable"""
        service = DeepSeekOCRService()
        service.model_loaded = False
        
        # Create test image
        img = Image.new('RGB', (100, 100), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        image_data = img_bytes.getvalue()
        
        # Process image (should use fallback)
        result = await service.process_image(image_data, prompt_type="document")
        
        assert isinstance(result, OCRResult)
        assert result.text is not None
        # Fallback returns placeholder or tesseract result
    
    @pytest.mark.asyncio
    async def test_extract_table(self):
        """Test table extraction"""
        service = DeepSeekOCRService()
        service.model_loaded = False  # Use fallback for testing
        
        # Create test image
        img = Image.new('RGB', (100, 100), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        image_data = img_bytes.getvalue()
        
        # Extract table
        result = await service.extract_table(image_data)
        
        assert "table" in result
        assert "raw_text" in result
        assert "confidence" in result
    
    def test_language_detection(self):
        """Test language detection"""
        service = DeepSeekOCRService()
        
        # Test Chinese
        assert service._detect_language("这是中文文本") == "zh"
        
        # Test Japanese
        assert service._detect_language("これは日本語です") == "ja"
        
        # Test Korean
        assert service._detect_language("이것은 한국어입니다") == "ko"
        
        # Test Arabic
        assert service._detect_language("هذا نص عربي") == "ar"
        
        # Test English (default)
        assert service._detect_language("This is English text") == "en"
    
    def test_supported_languages(self):
        """Test supported languages list"""
        service = DeepSeekOCRService()
        languages = service.get_supported_languages()
        
        assert len(languages) > 50
        assert "en" in languages
        assert "zh" in languages
        assert "ar" in languages
        assert "ru" in languages
    
    def test_resolution_modes(self):
        """Test resolution modes"""
        service = DeepSeekOCRService()
        modes = service.get_resolution_modes()
        
        assert "tiny" in modes
        assert "small" in modes
        assert "base" in modes
        assert "large" in modes
        assert modes["base"]["size"] == 1024
        assert modes["large"]["tokens"] == 400


class TestDocumentManagementService:
    """Test Document Management Service"""
    
    @pytest.mark.asyncio
    async def test_upload_document(self, mock_db_session):
        """Test document upload"""
        service = DocumentManagementService(mock_db_session)
        
        # Create test image
        img = Image.new('RGB', (100, 100), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        image_data = img_bytes.getvalue()
        
        # Mock database execute
        mock_db_session.execute = AsyncMock()
        mock_db_session.commit = AsyncMock()
        
        # Upload document
        document = await service.upload_document(
            user_id="user_123",
            document_type=DocumentType.IDENTITY,
            filename="identity.png",
            file_data=image_data
        )
        
        assert document is not None
        assert document.user_id == "user_123"
        assert document.document_type == DocumentType.IDENTITY
        assert document.status == DocumentStatus.PENDING
        assert document.file_size == len(image_data)
    
    @pytest.mark.asyncio
    async def test_validate_file_size(self, mock_db_session):
        """Test file size validation"""
        service = DocumentManagementService(mock_db_session)
        
        # Create oversized file (>10MB)
        large_data = b"x" * (11 * 1024 * 1024)
        
        with pytest.raises(ValueError, match="File size exceeds maximum"):
            await service._validate_file(large_data, "test.png")
    
    @pytest.mark.asyncio
    async def test_validate_file_type(self, mock_db_session):
        """Test file type validation"""
        service = DocumentManagementService(mock_db_session)
        
        # Test invalid file type
        with pytest.raises(ValueError, match="File type not allowed"):
            await service._validate_file(b"test data", "test.exe")
    
    @pytest.mark.asyncio
    async def test_get_user_documents(self, mock_db_session):
        """Test retrieving user documents"""
        service = DocumentManagementService(mock_db_session)
        
        # Mock database result
        mock_result = Mock()
        mock_row = Mock()
        mock_row.document_id = "doc_123"
        mock_row.user_id = "user_123"
        mock_row.document_type = "identity"
        mock_row.filename = "identity.png"
        mock_row.file_path = "/tmp/doc_123.png"
        mock_row.file_size = 1024
        mock_row.mime_type = "image/png"
        mock_row.status = "processed"
        mock_row.ocr_text = "Test OCR text"
        mock_row.ocr_confidence = 0.95
        mock_row.metadata = "{}"
        mock_row.created_at = datetime.now(timezone.utc)
        mock_row.updated_at = datetime.now(timezone.utc)
        
        mock_result.fetchall = Mock(return_value=[mock_row])
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        # Get documents
        documents = await service.get_user_documents("user_123")
        
        assert len(documents) == 1
        assert documents[0].document_id == "doc_123"
        assert documents[0].user_id == "user_123"
    
    @pytest.mark.asyncio
    async def test_search_documents(self, mock_db_session):
        """Test document search"""
        service = DocumentManagementService(mock_db_session)
        
        # Mock database result
        mock_result = Mock()
        mock_result.fetchall = Mock(return_value=[])
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        
        # Search documents
        results = await service.search_documents(
            user_id="user_123",
            search_text="passport"
        )
        
        assert isinstance(results, list)
        mock_db_session.execute.assert_called_once()


class TestDeepSeekKYCIntegration:
    """Test DeepSeek-KYC Integration"""
    
    @pytest.mark.asyncio
    async def test_process_kyc_document(self, mock_db_session):
        """Test KYC document processing"""
        integration = DeepSeekKYCIntegration(mock_db_session)
        
        # Mock document service
        mock_document = Mock()
        mock_document.document_id = "doc_123"
        mock_document.created_at = datetime.now(timezone.utc)
        
        integration.doc_service.upload_document = AsyncMock(return_value=mock_document)
        
        mock_ocr_result = OCRResult(
            text="John Doe\nDate of Birth: 1990-01-01\nID Number: ABC123456",
            confidence=0.95,
            language="en"
        )
        integration.doc_service.process_document_ocr = AsyncMock(return_value=mock_ocr_result)
        
        # Create test image
        img = Image.new('RGB', (100, 100), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        image_data = img_bytes.getvalue()
        
        # Process document
        result = await integration.process_kyc_document(
            user_id="user_123",
            document_type="identity",
            image_data=image_data,
            filename="identity.png"
        )
        
        assert result["document_id"] == "doc_123"
        assert result["status"] == "processed"
        assert result["ocr_confidence"] == 0.95
        assert "structured_data" in result
    
    @pytest.mark.asyncio
    async def test_batch_process_kyc_documents(self, mock_db_session):
        """Test batch KYC document processing"""
        integration = DeepSeekKYCIntegration(mock_db_session)
        
        # Mock successful processing
        integration.process_kyc_document = AsyncMock(return_value={
            "document_id": "doc_123",
            "status": "processed"
        })
        
        # Create test documents
        img = Image.new('RGB', (100, 100), color='white')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        image_data = img_bytes.getvalue()
        
        documents = [
            {"type": "identity", "data": image_data, "filename": "id.png"},
            {"type": "proof_of_address", "data": image_data, "filename": "poa.png"}
        ]
        
        # Batch process
        results = await integration.batch_process_kyc_documents(
            user_id="user_123",
            documents=documents
        )
        
        assert len(results) == 2
    
    def test_extract_name(self):
        """Test name extraction"""
        integration = DeepSeekKYCIntegration(Mock())
        
        text = "Full Name: John Doe\nDate of Birth: 1990-01-01"
        name = integration._extract_name(text)
        
        assert name == "John Doe"
    
    def test_extract_date_of_birth(self):
        """Test date of birth extraction"""
        integration = DeepSeekKYCIntegration(Mock())
        
        text = "Date of Birth: 1990-01-01"
        dob = integration._extract_date_of_birth(text)
        
        assert dob == "1990-01-01"
    
    def test_extract_id_number(self):
        """Test ID number extraction"""
        integration = DeepSeekKYCIntegration(Mock())
        
        text = "ID Number: ABC123456"
        id_num = integration._extract_id_number(text)
        
        assert id_num == "ABC123456"
    
    def test_fuzzy_match(self):
        """Test fuzzy string matching"""
        integration = DeepSeekKYCIntegration(Mock())
        
        # Exact match
        assert integration._fuzzy_match("John Doe", "John Doe") == True
        
        # Similar match
        assert integration._fuzzy_match("John A. Doe", "John Doe", threshold=0.7) == True
        
        # No match
        assert integration._fuzzy_match("Jane Smith", "John Doe") == False
        
        # None handling
        assert integration._fuzzy_match(None, "John Doe") == False


# Pytest fixtures

@pytest.fixture
def mock_db_session():
    """Mock database session"""
    session = Mock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    return session


@pytest.fixture
def sample_image_data():
    """Create sample image data"""
    img = Image.new('RGB', (100, 100), color='white')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    return img_bytes.getvalue()


@pytest.fixture
def sample_document():
    """Create sample document"""
    return Document(
        document_id="doc_123",
        user_id="user_123",
        document_type=DocumentType.IDENTITY,
        filename="identity.png",
        file_path="/tmp/doc_123.png",
        file_size=1024,
        mime_type="image/png",
        status=DocumentStatus.PROCESSED,
        ocr_text="Sample OCR text",
        ocr_confidence=0.95
    )


# Test configuration
pytest_plugins = ['pytest_asyncio']


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
