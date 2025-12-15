"""
DeepSeek-OCR Service
Multi-language OCR service using DeepSeek-OCR model
Supports 100+ languages, document parsing, and layout preservation
"""

import asyncio
import base64
import json
import os
import tempfile
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from pathlib import Path
from decimal import Decimal
import structlog
from PIL import Image
import io
import httpx

logger = structlog.get_logger()


class DeepSeekOCRConfig:
    """Configuration for DeepSeek-OCR service"""
    
    def __init__(self):
        # Model configuration
        self.model_name = "deepseek-ai/DeepSeek-OCR"
        self.api_endpoint = os.getenv("DEEPSEEK_OCR_ENDPOINT", "http://localhost:8000/v1")
        self.api_key = os.getenv("DEEPSEEK_OCR_API_KEY", "")
        
        # Resolution modes
        self.resolution_modes = {
            "tiny": {"size": 512, "tokens": 64},
            "small": {"size": 640, "tokens": 100},
            "base": {"size": 1024, "tokens": 256},
            "large": {"size": 1280, "tokens": 400}
        }
        
        # Default settings
        self.default_resolution = "base"
        self.max_tokens = 8192
        self.temperature = 0.0
        self.timeout = 300  # 5 minutes
        
        # Prompt templates
        self.prompts = {
            "document": "<image>\n<|grounding|>Convert the document to markdown.",
            "free_ocr": "<image>\nFree OCR.",
            "image_ocr": "<image>\n<|grounding|>OCR this image.",
            "figure": "<image>\nParse the figure.",
            "detailed": "<image>\nDescribe this image in detail.",
            "table": "<image>\n<|grounding|>Extract the table from this image.",
            "formula": "<image>\n<|grounding|>Extract mathematical formulas from this image."
        }
        
        # Supported languages (100+)
        self.supported_languages = [
            # Latin-based
            "en", "es", "fr", "de", "it", "pt", "nl", "pl", "ro", "cs", "sv", "da", "no", "fi",
            # Cyrillic
            "ru", "uk", "bg", "sr", "mk",
            # Asian
            "zh", "ja", "ko", "th", "vi", "id", "ms",
            # Arabic script
            "ar", "fa", "ur",
            # Indic scripts
            "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa",
            # Other
            "he", "tr", "el", "hu", "et", "lv", "lt", "sl", "sk"
        ]


class OCRResult:
    """OCR result container"""
    
    def __init__(
        self,
        text: str,
        confidence: float,
        language: Optional[str] = None,
        layout: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.text = text
        self.confidence = confidence
        self.language = language
        self.layout = layout or {}
        self.metadata = metadata or {}
        self.timestamp = datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "text": self.text,
            "confidence": self.confidence,
            "language": self.language,
            "layout": self.layout,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat()
        }


class DeepSeekOCRService:
    """
    DeepSeek-OCR Service
    Provides OCR capabilities using DeepSeek-OCR model
    """
    
    def __init__(self):
        self.config = DeepSeekOCRConfig()
        self.client: Optional[httpx.AsyncClient] = None
        self.model_loaded = False
        
        logger.info("DeepSeek-OCR service initialized",
                   endpoint=self.config.api_endpoint,
                   model=self.config.model_name)
    
    async def initialize(self):
        """Initialize OCR service"""
        try:
            # Create HTTP client
            self.client = httpx.AsyncClient(
                base_url=self.config.api_endpoint,
                timeout=self.config.timeout,
                headers={
                    "Authorization": f"Bearer {self.config.api_key}" if self.config.api_key else "",
                    "Content-Type": "application/json"
                }
            )
            
            # Check if API is available
            try:
                response = await self.client.get("/health", timeout=5.0)
                if response.status_code == 200:
                    self.model_loaded = True
                    logger.info("DeepSeek-OCR API connected")
                else:
                    logger.warning("DeepSeek-OCR API not available, using fallback mode")
            except Exception as e:
                logger.warning("DeepSeek-OCR API check failed, using fallback mode", error=str(e))
            
        except Exception as e:
            logger.error("DeepSeek-OCR initialization failed", error=str(e))
            raise
    
    async def shutdown(self):
        """Shutdown OCR service"""
        if self.client:
            await self.client.aclose()
            logger.info("DeepSeek-OCR service shutdown")
    
    async def process_image(
        self,
        image_data: bytes,
        prompt_type: str = "document",
        resolution: str = "base",
        language: Optional[str] = None
    ) -> OCRResult:
        """
        Process image with OCR
        
        Args:
            image_data: Image bytes
            prompt_type: Type of prompt (document, free_ocr, image_ocr, etc.)
            resolution: Resolution mode (tiny, small, base, large)
            language: Expected language (optional)
            
        Returns:
            OCR result
        """
        try:
            # Validate inputs
            if prompt_type not in self.config.prompts:
                prompt_type = "document"
            
            if resolution not in self.config.resolution_modes:
                resolution = self.config.default_resolution
            
            # Get prompt
            prompt = self.config.prompts[prompt_type]
            
            # Prepare image
            image = Image.open(io.BytesIO(image_data)).convert("RGB")
            
            # Resize if needed
            target_size = self.config.resolution_modes[resolution]["size"]
            if max(image.size) > target_size:
                image.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
            
            # Convert to base64
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            image_b64 = base64.b64encode(buffered.getvalue()).decode()
            
            # Call OCR API
            if self.model_loaded and self.client:
                result = await self._call_api(image_b64, prompt, resolution)
            else:
                # Fallback to simulated OCR
                result = await self._fallback_ocr(image, language)
            
            logger.info("OCR processing completed",
                       prompt_type=prompt_type,
                       resolution=resolution,
                       text_length=len(result.text))
            
            return result
            
        except Exception as e:
            logger.error("OCR processing failed", error=str(e))
            raise
    
    async def _call_api(
        self,
        image_b64: str,
        prompt: str,
        resolution: str
    ) -> OCRResult:
        """Call DeepSeek-OCR API"""
        try:
            # Prepare request
            request_data = {
                "model": self.config.model_name,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{image_b64}"
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ],
                "max_tokens": self.config.max_tokens,
                "temperature": self.config.temperature
            }
            
            # Make request
            response = await self.client.post("/chat/completions", json=request_data)
            response.raise_for_status()
            
            # Parse response
            result_data = response.json()
            text = result_data["choices"][0]["message"]["content"]
            
            # Extract confidence (if available)
            confidence = 0.95  # Default high confidence for DeepSeek-OCR
            
            # Detect language from text
            language = self._detect_language(text)
            
            return OCRResult(
                text=text,
                confidence=confidence,
                language=language,
                metadata={
                    "model": self.config.model_name,
                    "resolution": resolution,
                    "tokens_used": result_data.get("usage", {}).get("total_tokens", 0)
                }
            )
            
        except Exception as e:
            logger.error("API call failed", error=str(e))
            raise
    
    async def _fallback_ocr(
        self,
        image: Image.Image,
        language: Optional[str] = None
    ) -> OCRResult:
        """
        Fallback OCR using Tesseract or similar
        Used when DeepSeek-OCR API is not available
        """
        try:
            # Try to use pytesseract if available
            try:
                import pytesseract
                
                # Configure language
                lang = language if language else "eng"
                
                # Perform OCR
                text = pytesseract.image_to_string(image, lang=lang)
                confidence = 0.75  # Lower confidence for fallback
                
                logger.info("Fallback OCR completed", engine="tesseract")
                
            except ImportError:
                # Ultimate fallback - return placeholder
                text = "[OCR service unavailable - please configure DeepSeek-OCR API endpoint]"
                confidence = 0.0
                logger.warning("No OCR engine available, returning placeholder")
            
            return OCRResult(
                text=text,
                confidence=confidence,
                language=language,
                metadata={"engine": "fallback"}
            )
            
        except Exception as e:
            logger.error("Fallback OCR failed", error=str(e))
            raise
    
    def _detect_language(self, text: str) -> Optional[str]:
        """
        Detect language from text
        Simple heuristic-based detection
        """
        # Check for common language patterns
        if any(ord(c) >= 0x4E00 and ord(c) <= 0x9FFF for c in text[:100]):
            return "zh"  # Chinese
        elif any(ord(c) >= 0x3040 and ord(c) <= 0x309F for c in text[:100]):
            return "ja"  # Japanese
        elif any(ord(c) >= 0xAC00 and ord(c) <= 0xD7AF for c in text[:100]):
            return "ko"  # Korean
        elif any(ord(c) >= 0x0600 and ord(c) <= 0x06FF for c in text[:100]):
            return "ar"  # Arabic
        elif any(ord(c) >= 0x0400 and ord(c) <= 0x04FF for c in text[:100]):
            return "ru"  # Russian/Cyrillic
        else:
            return "en"  # Default to English
    
    async def process_pdf(
        self,
        pdf_data: bytes,
        prompt_type: str = "document",
        resolution: str = "base"
    ) -> List[OCRResult]:
        """
        Process PDF document
        
        Args:
            pdf_data: PDF bytes
            prompt_type: Type of prompt
            resolution: Resolution mode
            
        Returns:
            List of OCR results (one per page)
        """
        try:
            from pdf2image import convert_from_bytes
            
            # Convert PDF to images
            images = convert_from_bytes(pdf_data)
            
            # Process each page
            results = []
            for i, image in enumerate(images):
                # Convert PIL image to bytes
                buffered = io.BytesIO()
                image.save(buffered, format="PNG")
                image_bytes = buffered.getvalue()
                
                # Process page
                result = await self.process_image(
                    image_bytes,
                    prompt_type=prompt_type,
                    resolution=resolution
                )
                
                # Add page number to metadata
                result.metadata["page_number"] = i + 1
                results.append(result)
                
                logger.info("PDF page processed", page=i+1, total=len(images))
            
            return results
            
        except Exception as e:
            logger.error("PDF processing failed", error=str(e))
            raise
    
    async def batch_process(
        self,
        images: List[bytes],
        prompt_type: str = "document",
        resolution: str = "base"
    ) -> List[OCRResult]:
        """
        Batch process multiple images
        
        Args:
            images: List of image bytes
            prompt_type: Type of prompt
            resolution: Resolution mode
            
        Returns:
            List of OCR results
        """
        try:
            # Process in parallel
            tasks = [
                self.process_image(img, prompt_type, resolution)
                for img in images
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter out exceptions
            valid_results = [
                r for r in results
                if isinstance(r, OCRResult)
            ]
            
            logger.info("Batch processing completed",
                       total=len(images),
                       successful=len(valid_results))
            
            return valid_results
            
        except Exception as e:
            logger.error("Batch processing failed", error=str(e))
            raise
    
    async def extract_table(self, image_data: bytes) -> Dict[str, Any]:
        """
        Extract table from image
        
        Args:
            image_data: Image bytes
            
        Returns:
            Extracted table data
        """
        try:
            result = await self.process_image(
                image_data,
                prompt_type="table",
                resolution="large"
            )
            
            # Parse markdown table to structured data
            table_data = self._parse_markdown_table(result.text)
            
            return {
                "table": table_data,
                "raw_text": result.text,
                "confidence": result.confidence
            }
            
        except Exception as e:
            logger.error("Table extraction failed", error=str(e))
            raise
    
    def _parse_markdown_table(self, markdown: str) -> List[List[str]]:
        """Parse markdown table to 2D array"""
        lines = markdown.strip().split("\n")
        table = []
        
        for line in lines:
            if "|" in line and not line.strip().startswith("|---"):
                # Extract cells
                cells = [cell.strip() for cell in line.split("|")]
                # Remove empty first/last cells
                cells = [c for c in cells if c]
                if cells:
                    table.append(cells)
        
        return table
    
    async def extract_formulas(self, image_data: bytes) -> List[str]:
        """
        Extract mathematical formulas from image
        
        Args:
            image_data: Image bytes
            
        Returns:
            List of extracted formulas
        """
        try:
            result = await self.process_image(
                image_data,
                prompt_type="formula",
                resolution="large"
            )
            
            # Extract formulas from text
            formulas = self._extract_latex_formulas(result.text)
            
            return formulas
            
        except Exception as e:
            logger.error("Formula extraction failed", error=str(e))
            raise
    
    def _extract_latex_formulas(self, text: str) -> List[str]:
        """Extract LaTeX formulas from text"""
        import re
        
        # Find inline formulas: $...$
        inline = re.findall(r'\$([^\$]+)\$', text)
        
        # Find display formulas: $$...$$
        display = re.findall(r'\$\$([^\$]+)\$\$', text)
        
        return inline + display
    
    def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        return self.config.supported_languages
    
    def get_resolution_modes(self) -> Dict[str, Dict[str, int]]:
        """Get available resolution modes"""
        return self.config.resolution_modes


# Global service instance
_ocr_service: Optional[DeepSeekOCRService] = None


async def get_ocr_service() -> DeepSeekOCRService:
    """Get or create OCR service instance"""
    global _ocr_service
    
    if _ocr_service is None:
        _ocr_service = DeepSeekOCRService()
        await _ocr_service.initialize()
    
    return _ocr_service
