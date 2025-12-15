"""
Document Management Service
Comprehensive document storage, processing, and retrieval system
Integrates with DeepSeek-OCR for intelligent document processing
"""

import asyncio
import hashlib
import json
import mimetypes
import os
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from pathlib import Path
from decimal import Decimal
from enum import Enum
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import aiofiles

from app.services.deepseek_ocr_service import get_ocr_service, OCRResult

logger = structlog.get_logger()


class DocumentType(str, Enum):
    """Document types"""
    IDENTITY = "identity"  # ID cards, passports
    PROOF_OF_ADDRESS = "proof_of_address"  # Utility bills, bank statements
    SELFIE = "selfie"  # Selfie photos
    BANK_STATEMENT = "bank_statement"
    TAX_DOCUMENT = "tax_document"
    CONTRACT = "contract"
    INVOICE = "invoice"
    RECEIPT = "receipt"
    OTHER = "other"


class DocumentStatus(str, Enum):
    """Document processing status"""
    PENDING = "pending"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
    REJECTED = "rejected"
    APPROVED = "approved"


class Document:
    """Document model"""
    
    def __init__(
        self,
        document_id: str,
        user_id: str,
        document_type: DocumentType,
        filename: str,
        file_path: str,
        file_size: int,
        mime_type: str,
        status: DocumentStatus = DocumentStatus.PENDING,
        ocr_text: Optional[str] = None,
        ocr_confidence: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.document_id = document_id
        self.user_id = user_id
        self.document_type = document_type
        self.filename = filename
        self.file_path = file_path
        self.file_size = file_size
        self.mime_type = mime_type
        self.status = status
        self.ocr_text = ocr_text
        self.ocr_confidence = ocr_confidence
        self.metadata = metadata or {}
        self.created_at = created_at or datetime.now(timezone.utc)
        self.updated_at = updated_at or datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "document_id": self.document_id,
            "user_id": self.user_id,
            "document_type": self.document_type.value,
            "filename": self.filename,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "status": self.status.value,
            "ocr_text": self.ocr_text,
            "ocr_confidence": self.ocr_confidence,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }


class DocumentManagementService:
    """
    Document Management Service
    Handles document upload, storage, OCR processing, and retrieval
    """
    
    def __init__(self, db_session: AsyncSession, storage_path: str = "/tmp/neobank_documents"):
        self.db = db_session
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Document retention policy (days)
        self.retention_policy = {
            DocumentType.IDENTITY: 2555,  # 7 years
            DocumentType.PROOF_OF_ADDRESS: 1825,  # 5 years
            DocumentType.BANK_STATEMENT: 2555,  # 7 years
            DocumentType.TAX_DOCUMENT: 2555,  # 7 years
            DocumentType.CONTRACT: 3650,  # 10 years
            DocumentType.OTHER: 365  # 1 year
        }
        
        # Allowed file types
        self.allowed_mime_types = {
            "image/jpeg",
            "image/png",
            "image/tiff",
            "image/bmp",
            "image/webp",
            "application/pdf"
        }
        
        # Max file size (10MB)
        self.max_file_size = 10 * 1024 * 1024
        
        logger.info("Document management service initialized",
                   storage_path=str(self.storage_path))
    
    async def upload_document(
        self,
        user_id: str,
        document_type: DocumentType,
        filename: str,
        file_data: bytes,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Document:
        """
        Upload and store document
        
        Args:
            user_id: User identifier
            document_type: Type of document
            filename: Original filename
            file_data: File bytes
            metadata: Additional metadata
            
        Returns:
            Document object
        """
        try:
            # Validate file
            await self._validate_file(file_data, filename)
            
            # Generate document ID
            document_id = self._generate_document_id(user_id, filename, file_data)
            
            # Determine MIME type
            mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            
            # Create user directory
            user_dir = self.storage_path / user_id
            user_dir.mkdir(parents=True, exist_ok=True)
            
            # Save file
            file_extension = Path(filename).suffix
            file_path = user_dir / f"{document_id}{file_extension}"
            
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(file_data)
            
            # Create document record
            document = Document(
                document_id=document_id,
                user_id=user_id,
                document_type=document_type,
                filename=filename,
                file_path=str(file_path),
                file_size=len(file_data),
                mime_type=mime_type,
                status=DocumentStatus.PENDING,
                metadata=metadata or {}
            )
            
            # Store in database
            await self._save_document_to_db(document)
            
            logger.info("Document uploaded",
                       document_id=document_id,
                       user_id=user_id,
                       type=document_type.value,
                       size=len(file_data))
            
            return document
            
        except Exception as e:
            logger.error("Document upload failed", error=str(e))
            raise
    
    async def _validate_file(self, file_data: bytes, filename: str):
        """Validate file before upload"""
        # Check file size
        if len(file_data) > self.max_file_size:
            raise ValueError(f"File size exceeds maximum ({self.max_file_size} bytes)")
        
        # Check MIME type
        mime_type = mimetypes.guess_type(filename)[0]
        if mime_type not in self.allowed_mime_types:
            raise ValueError(f"File type not allowed: {mime_type}")
        
        # Check for malicious content (basic check)
        if b"<script" in file_data.lower():
            raise ValueError("Potentially malicious content detected")
    
    def _generate_document_id(self, user_id: str, filename: str, file_data: bytes) -> str:
        """Generate unique document ID"""
        content = f"{user_id}{filename}{datetime.now(timezone.utc).isoformat()}"
        hash_obj = hashlib.sha256(content.encode() + file_data[:1024])
        return f"doc_{hash_obj.hexdigest()[:16]}"
    
    async def _save_document_to_db(self, document: Document):
        """Save document metadata to database"""
        try:
            query = text("""
                INSERT INTO documents (
                    document_id, user_id, document_type, filename, file_path,
                    file_size, mime_type, status, ocr_text, ocr_confidence,
                    metadata, created_at, updated_at
                ) VALUES (
                    :document_id, :user_id, :document_type, :filename, :file_path,
                    :file_size, :mime_type, :status, :ocr_text, :ocr_confidence,
                    :metadata, :created_at, :updated_at
                )
            """)
            
            await self.db.execute(query, {
                "document_id": document.document_id,
                "user_id": document.user_id,
                "document_type": document.document_type.value,
                "filename": document.filename,
                "file_path": document.file_path,
                "file_size": document.file_size,
                "mime_type": document.mime_type,
                "status": document.status.value,
                "ocr_text": document.ocr_text,
                "ocr_confidence": document.ocr_confidence,
                "metadata": json.dumps(document.metadata),
                "created_at": document.created_at,
                "updated_at": document.updated_at
            })
            
            await self.db.commit()
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Database save failed", error=str(e))
            raise
    
    async def process_document_ocr(self, document_id: str) -> OCRResult:
        """
        Process document with OCR
        
        Args:
            document_id: Document identifier
            
        Returns:
            OCR result
        """
        try:
            # Get document
            document = await self.get_document(document_id)
            
            if not document:
                raise ValueError(f"Document not found: {document_id}")
            
            # Update status
            await self._update_document_status(document_id, DocumentStatus.PROCESSING)
            
            # Read file
            async with aiofiles.open(document.file_path, 'rb') as f:
                file_data = await f.read()
            
            # Get OCR service
            ocr_service = await get_ocr_service()
            
            # Determine prompt type based on document type
            prompt_type = self._get_prompt_type(document.document_type)
            
            # Process with OCR
            if document.mime_type == "application/pdf":
                results = await ocr_service.process_pdf(file_data, prompt_type=prompt_type)
                # Combine results
                ocr_text = "\n\n--- Page Break ---\n\n".join([r.text for r in results])
                ocr_confidence = sum(r.confidence for r in results) / len(results)
                ocr_result = OCRResult(
                    text=ocr_text,
                    confidence=ocr_confidence,
                    metadata={"pages": len(results)}
                )
            else:
                ocr_result = await ocr_service.process_image(file_data, prompt_type=prompt_type)
            
            # Update document with OCR results
            await self._update_document_ocr(
                document_id,
                ocr_result.text,
                ocr_result.confidence
            )
            
            # Update status
            await self._update_document_status(document_id, DocumentStatus.PROCESSED)
            
            logger.info("Document OCR completed",
                       document_id=document_id,
                       confidence=ocr_result.confidence,
                       text_length=len(ocr_result.text))
            
            return ocr_result
            
        except Exception as e:
            logger.error("Document OCR failed", document_id=document_id, error=str(e))
            await self._update_document_status(document_id, DocumentStatus.FAILED)
            raise
    
    def _get_prompt_type(self, document_type: DocumentType) -> str:
        """Get OCR prompt type based on document type"""
        mapping = {
            DocumentType.IDENTITY: "document",
            DocumentType.PROOF_OF_ADDRESS: "document",
            DocumentType.BANK_STATEMENT: "document",
            DocumentType.TAX_DOCUMENT: "document",
            DocumentType.CONTRACT: "document",
            DocumentType.INVOICE: "document",
            DocumentType.RECEIPT: "image_ocr",
            DocumentType.SELFIE: "detailed",
            DocumentType.OTHER: "free_ocr"
        }
        return mapping.get(document_type, "document")
    
    async def _update_document_status(self, document_id: str, status: DocumentStatus):
        """Update document status"""
        try:
            query = text("""
                UPDATE documents
                SET status = :status, updated_at = :updated_at
                WHERE document_id = :document_id
            """)
            
            await self.db.execute(query, {
                "document_id": document_id,
                "status": status.value,
                "updated_at": datetime.now(timezone.utc)
            })
            
            await self.db.commit()
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Status update failed", error=str(e))
            raise
    
    async def _update_document_ocr(
        self,
        document_id: str,
        ocr_text: str,
        ocr_confidence: float
    ):
        """Update document with OCR results"""
        try:
            query = text("""
                UPDATE documents
                SET ocr_text = :ocr_text,
                    ocr_confidence = :ocr_confidence,
                    updated_at = :updated_at
                WHERE document_id = :document_id
            """)
            
            await self.db.execute(query, {
                "document_id": document_id,
                "ocr_text": ocr_text,
                "ocr_confidence": ocr_confidence,
                "updated_at": datetime.now(timezone.utc)
            })
            
            await self.db.commit()
            
        except Exception as e:
            await self.db.rollback()
            logger.error("OCR update failed", error=str(e))
            raise
    
    async def get_document(self, document_id: str) -> Optional[Document]:
        """Get document by ID"""
        try:
            query = text("""
                SELECT *
                FROM documents
                WHERE document_id = :document_id
            """)
            
            result = await self.db.execute(query, {"document_id": document_id})
            row = result.fetchone()
            
            if not row:
                return None
            
            return Document(
                document_id=row.document_id,
                user_id=row.user_id,
                document_type=DocumentType(row.document_type),
                filename=row.filename,
                file_path=row.file_path,
                file_size=row.file_size,
                mime_type=row.mime_type,
                status=DocumentStatus(row.status),
                ocr_text=row.ocr_text,
                ocr_confidence=row.ocr_confidence,
                metadata=json.loads(row.metadata) if row.metadata else {},
                created_at=row.created_at,
                updated_at=row.updated_at
            )
            
        except Exception as e:
            logger.error("Get document failed", error=str(e))
            return None
    
    async def get_user_documents(
        self,
        user_id: str,
        document_type: Optional[DocumentType] = None,
        status: Optional[DocumentStatus] = None
    ) -> List[Document]:
        """Get documents for a user"""
        try:
            conditions = ["user_id = :user_id"]
            params = {"user_id": user_id}
            
            if document_type:
                conditions.append("document_type = :document_type")
                params["document_type"] = document_type.value
            
            if status:
                conditions.append("status = :status")
                params["status"] = status.value
            
            where_clause = " AND ".join(conditions)
            
            query = text(f"""
                SELECT *
                FROM documents
                WHERE {where_clause}
                ORDER BY created_at DESC
            """)
            
            result = await self.db.execute(query, params)
            rows = result.fetchall()
            
            documents = []
            for row in rows:
                documents.append(Document(
                    document_id=row.document_id,
                    user_id=row.user_id,
                    document_type=DocumentType(row.document_type),
                    filename=row.filename,
                    file_path=row.file_path,
                    file_size=row.file_size,
                    mime_type=row.mime_type,
                    status=DocumentStatus(row.status),
                    ocr_text=row.ocr_text,
                    ocr_confidence=row.ocr_confidence,
                    metadata=json.loads(row.metadata) if row.metadata else {},
                    created_at=row.created_at,
                    updated_at=row.updated_at
                ))
            
            return documents
            
        except Exception as e:
            logger.error("Get user documents failed", error=str(e))
            return []
    
    async def delete_document(self, document_id: str) -> bool:
        """Delete document"""
        try:
            # Get document
            document = await self.get_document(document_id)
            
            if not document:
                return False
            
            # Delete file
            if os.path.exists(document.file_path):
                os.remove(document.file_path)
            
            # Delete from database
            query = text("DELETE FROM documents WHERE document_id = :document_id")
            await self.db.execute(query, {"document_id": document_id})
            await self.db.commit()
            
            logger.info("Document deleted", document_id=document_id)
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Document deletion failed", error=str(e))
            return False
    
    async def cleanup_expired_documents(self) -> int:
        """Clean up expired documents based on retention policy"""
        try:
            deleted_count = 0
            
            for doc_type, retention_days in self.retention_policy.items():
                cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
                
                # Get expired documents
                query = text("""
                    SELECT document_id
                    FROM documents
                    WHERE document_type = :document_type
                    AND created_at < :cutoff_date
                """)
                
                result = await self.db.execute(query, {
                    "document_type": doc_type.value,
                    "cutoff_date": cutoff_date
                })
                
                rows = result.fetchall()
                
                # Delete each document
                for row in rows:
                    if await self.delete_document(row.document_id):
                        deleted_count += 1
            
            logger.info("Document cleanup completed", deleted=deleted_count)
            return deleted_count
            
        except Exception as e:
            logger.error("Document cleanup failed", error=str(e))
            return 0
    
    async def search_documents(
        self,
        user_id: str,
        search_text: str,
        document_type: Optional[DocumentType] = None
    ) -> List[Document]:
        """Search documents by OCR text"""
        try:
            conditions = ["user_id = :user_id", "ocr_text ILIKE :search_text"]
            params = {
                "user_id": user_id,
                "search_text": f"%{search_text}%"
            }
            
            if document_type:
                conditions.append("document_type = :document_type")
                params["document_type"] = document_type.value
            
            where_clause = " AND ".join(conditions)
            
            query = text(f"""
                SELECT *
                FROM documents
                WHERE {where_clause}
                ORDER BY ocr_confidence DESC, created_at DESC
            """)
            
            result = await self.db.execute(query, params)
            rows = result.fetchall()
            
            documents = []
            for row in rows:
                documents.append(Document(
                    document_id=row.document_id,
                    user_id=row.user_id,
                    document_type=DocumentType(row.document_type),
                    filename=row.filename,
                    file_path=row.file_path,
                    file_size=row.file_size,
                    mime_type=row.mime_type,
                    status=DocumentStatus(row.status),
                    ocr_text=row.ocr_text,
                    ocr_confidence=row.ocr_confidence,
                    metadata=json.loads(row.metadata) if row.metadata else {},
                    created_at=row.created_at,
                    updated_at=row.updated_at
                ))
            
            return documents
            
        except Exception as e:
            logger.error("Document search failed", error=str(e))
            return []
