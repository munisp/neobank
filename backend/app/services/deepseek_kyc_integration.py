"""
DeepSeek-OCR Integration for Enhanced KYC
Integrates DeepSeek-OCR with existing KYC service
Replaces OLMOCR/GOT-OCR with DeepSeek-OCR for better multi-language support
"""

import asyncio
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.deepseek_ocr_service import get_ocr_service, OCRResult
from app.services.document_management_service import (
    DocumentManagementService,
    Document,
    DocumentType,
    DocumentStatus
)
from app.services.production_kyc_service import ProductionKYCService

logger = structlog.get_logger()


class DeepSeekKYCIntegration:
    """
    Integration layer between DeepSeek-OCR and existing KYC services
    Provides backward compatibility while using DeepSeek-OCR
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.kyc_service = ProductionKYCService()
        self.doc_service = DocumentManagementService(db_session)
        
        logger.info("DeepSeek-KYC integration initialized")
    
    async def process_kyc_document(
        self,
        user_id: str,
        document_type: str,
        image_data: bytes,
        filename: str
    ) -> Dict[str, Any]:
        """
        Process KYC document using DeepSeek-OCR
        
        Args:
            user_id: User identifier
            document_type: Type of document (identity, proof_of_address, etc.)
            image_data: Image bytes
            filename: Original filename
            
        Returns:
            Processing result with OCR data
        """
        try:
            # Map document type
            doc_type_enum = self._map_document_type(document_type)
            
            # Upload document
            document = await self.doc_service.upload_document(
                user_id=user_id,
                document_type=doc_type_enum,
                filename=filename,
                file_data=image_data
            )
            
            # Process with OCR
            ocr_result = await self.doc_service.process_document_ocr(document.document_id)
            
            # Extract structured data
            structured_data = await self._extract_structured_data(
                ocr_result.text,
                doc_type_enum
            )
            
            result = {
                "document_id": document.document_id,
                "document_type": document_type,
                "status": "processed",
                "ocr_text": ocr_result.text,
                "ocr_confidence": ocr_result.confidence,
                "structured_data": structured_data,
                "language": ocr_result.language,
                "processing_time": (datetime.now(timezone.utc) - document.created_at).total_seconds(),
                "metadata": ocr_result.metadata
            }
            
            logger.info("KYC document processed",
                       document_id=document.document_id,
                       type=document_type,
                       confidence=ocr_result.confidence)
            
            return result
            
        except Exception as e:
            logger.error("KYC document processing failed", error=str(e))
            raise
    
    async def batch_process_kyc_documents(
        self,
        user_id: str,
        documents: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Batch process multiple KYC documents
        
        Args:
            user_id: User identifier
            documents: List of documents with type, data, and filename
            
        Returns:
            List of processing results
        """
        try:
            tasks = [
                self.process_kyc_document(
                    user_id=user_id,
                    document_type=doc["type"],
                    image_data=doc["data"],
                    filename=doc["filename"]
                )
                for doc in documents
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter out exceptions
            valid_results = [
                r for r in results
                if not isinstance(r, Exception)
            ]
            
            logger.info("Batch KYC processing completed",
                       total=len(documents),
                       successful=len(valid_results))
            
            return valid_results
            
        except Exception as e:
            logger.error("Batch KYC processing failed", error=str(e))
            raise
    
    async def verify_identity_document_deepseek(
        self,
        user_id: str,
        document_id: str,
        expected_name: str,
        expected_dob: str
    ) -> Dict[str, Any]:
        """
        Verify identity document using DeepSeek-OCR results
        
        Args:
            user_id: User identifier
            document_id: Document identifier
            expected_name: Expected full name
            expected_dob: Expected date of birth
            
        Returns:
            Verification result
        """
        try:
            # Get document
            document = await self.doc_service.get_document(document_id)
            
            if not document or document.user_id != user_id:
                raise ValueError("Document not found or access denied")
            
            # Get OCR text
            if not document.ocr_text:
                raise ValueError("Document not yet processed with OCR")
            
            # Extract and verify data
            extracted_name = self._extract_name(document.ocr_text)
            extracted_dob = self._extract_date_of_birth(document.ocr_text)
            extracted_id_number = self._extract_id_number(document.ocr_text)
            
            # Verify matches
            name_match = self._fuzzy_match(extracted_name, expected_name, threshold=0.8)
            dob_match = extracted_dob == expected_dob
            
            # Calculate verification score
            verification_score = 0.0
            if name_match:
                verification_score += 0.5
            if dob_match:
                verification_score += 0.3
            if extracted_id_number:
                verification_score += 0.2
            
            verified = verification_score >= 0.7 and document.ocr_confidence >= 0.75
            
            result = {
                "document_id": document_id,
                "verified": verified,
                "verification_score": verification_score,
                "ocr_confidence": document.ocr_confidence,
                "extracted_data": {
                    "name": extracted_name,
                    "date_of_birth": extracted_dob,
                    "id_number": extracted_id_number
                },
                "matches": {
                    "name": name_match,
                    "date_of_birth": dob_match
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            logger.info("Identity document verified",
                       document_id=document_id,
                       verified=verified,
                       score=verification_score)
            
            return result
            
        except Exception as e:
            logger.error("Identity verification failed", error=str(e))
            raise
    
    def _map_document_type(self, doc_type: str) -> DocumentType:
        """Map string document type to enum"""
        mapping = {
            "identity": DocumentType.IDENTITY,
            "national_id": DocumentType.IDENTITY,
            "passport": DocumentType.IDENTITY,
            "drivers_license": DocumentType.IDENTITY,
            "proof_of_address": DocumentType.PROOF_OF_ADDRESS,
            "utility_bill": DocumentType.PROOF_OF_ADDRESS,
            "bank_statement": DocumentType.BANK_STATEMENT,
            "selfie": DocumentType.SELFIE,
            "tax_document": DocumentType.TAX_DOCUMENT,
            "contract": DocumentType.CONTRACT,
            "invoice": DocumentType.INVOICE,
            "receipt": DocumentType.RECEIPT
        }
        
        return mapping.get(doc_type.lower(), DocumentType.OTHER)
    
    async def _extract_structured_data(
        self,
        ocr_text: str,
        document_type: DocumentType
    ) -> Dict[str, Any]:
        """Extract structured data from OCR text"""
        structured_data = {}
        
        if document_type == DocumentType.IDENTITY:
            structured_data = {
                "full_name": self._extract_name(ocr_text),
                "date_of_birth": self._extract_date_of_birth(ocr_text),
                "id_number": self._extract_id_number(ocr_text),
                "gender": self._extract_gender(ocr_text),
                "address": self._extract_address(ocr_text),
                "expiry_date": self._extract_expiry_date(ocr_text)
            }
        
        elif document_type == DocumentType.PROOF_OF_ADDRESS:
            structured_data = {
                "customer_name": self._extract_name(ocr_text),
                "address": self._extract_address(ocr_text),
                "document_date": self._extract_document_date(ocr_text),
                "issuer": self._extract_issuer(ocr_text)
            }
        
        elif document_type == DocumentType.BANK_STATEMENT:
            structured_data = {
                "account_holder": self._extract_name(ocr_text),
                "account_number": self._extract_account_number(ocr_text),
                "statement_period": self._extract_statement_period(ocr_text),
                "bank_name": self._extract_bank_name(ocr_text)
            }
        
        # Remove None values
        structured_data = {k: v for k, v in structured_data.items() if v}
        
        return structured_data
    
    def _extract_name(self, text: str) -> Optional[str]:
        """Extract name from text"""
        import re
        patterns = [
            r"(?:Name|Full Name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
            r"([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)?)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_date_of_birth(self, text: str) -> Optional[str]:
        """Extract date of birth"""
        import re
        patterns = [
            r"(?:Date of Birth|DOB|Birth Date)[:\s]+(\d{4}-\d{2}-\d{2})",
            r"(?:Date of Birth|DOB|Birth Date)[:\s]+(\d{2}/\d{2}/\d{4})"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                # Normalize to YYYY-MM-DD
                if "/" in date_str:
                    parts = date_str.split("/")
                    if len(parts[2]) == 4:
                        return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
                return date_str
        
        return None
    
    def _extract_id_number(self, text: str) -> Optional[str]:
        """Extract ID number"""
        import re
        patterns = [
            r"(?:ID Number|Document Number|Passport Number)[:\s]+([A-Z0-9]+)",
            r"([A-Z]{1,2}\d{6,10})"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_gender(self, text: str) -> Optional[str]:
        """Extract gender"""
        import re
        patterns = [
            r"(?:Gender|Sex)[:\s]+(Male|Female|M|F)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                gender = match.group(1).upper()
                return "Male" if gender in ["M", "MALE"] else "Female"
        
        return None
    
    def _extract_address(self, text: str) -> Optional[str]:
        """Extract address"""
        import re
        # Look for address patterns
        lines = text.split("\n")
        for i, line in enumerate(lines):
            if re.search(r"(?:Address|Location)", line, re.IGNORECASE):
                # Get next 2-3 lines as address
                address_lines = lines[i+1:min(i+4, len(lines))]
                return " ".join(address_lines).strip()
        
        return None
    
    def _extract_expiry_date(self, text: str) -> Optional[str]:
        """Extract expiry date"""
        import re
        patterns = [
            r"(?:Expiry Date|Expires|Valid Until)[:\s]+(\d{4}-\d{2}-\d{2})",
            r"(?:Expiry Date|Expires|Valid Until)[:\s]+(\d{2}/\d{2}/\d{4})"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def _extract_document_date(self, text: str) -> Optional[str]:
        """Extract document date"""
        import re
        patterns = [
            r"(?:Date|Dated)[:\s]+(\d{4}-\d{2}-\d{2})",
            r"(?:Date|Dated)[:\s]+(\d{2}/\d{2}/\d{4})"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def _extract_issuer(self, text: str) -> Optional[str]:
        """Extract document issuer"""
        import re
        # Look for company/utility names
        lines = text.split("\n")
        if lines:
            # First line often contains issuer
            return lines[0].strip()
        
        return None
    
    def _extract_account_number(self, text: str) -> Optional[str]:
        """Extract account number"""
        import re
        patterns = [
            r"(?:Account Number|Account No)[:\s]+(\d{10,})",
            r"(\d{10,})"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        
        return None
    
    def _extract_statement_period(self, text: str) -> Optional[str]:
        """Extract statement period"""
        import re
        pattern = r"(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})"
        match = re.search(pattern, text)
        if match:
            return f"{match.group(1)} - {match.group(2)}"
        
        return None
    
    def _extract_bank_name(self, text: str) -> Optional[str]:
        """Extract bank name"""
        # Common bank names
        banks = [
            "Access Bank", "GTBank", "First Bank", "UBA", "Zenith Bank",
            "Fidelity Bank", "Union Bank", "Sterling Bank", "Stanbic IBTC",
            "Ecobank", "FCMB", "Wema Bank", "Polaris Bank"
        ]
        
        for bank in banks:
            if bank.lower() in text.lower():
                return bank
        
        return None
    
    def _fuzzy_match(self, str1: Optional[str], str2: str, threshold: float = 0.8) -> bool:
        """Fuzzy string matching"""
        if not str1:
            return False
        
        # Normalize strings
        s1 = str1.lower().replace(".", "").replace(",", "")
        s2 = str2.lower().replace(".", "").replace(",", "")
        
        # Exact match
        if s1 == s2:
            return True
        
        # Word-based matching
        words1 = set(s1.split())
        words2 = set(s2.split())
        
        if not words1 or not words2:
            return False
        
        # Calculate overlap
        overlap = len(words1 & words2)
        similarity = overlap / max(len(words1), len(words2))
        
        return similarity >= threshold


# Global instance
_deepseek_kyc: Optional[DeepSeekKYCIntegration] = None


async def get_deepseek_kyc(db_session: AsyncSession) -> DeepSeekKYCIntegration:
    """Get or create DeepSeek-KYC integration instance"""
    return DeepSeekKYCIntegration(db_session)
