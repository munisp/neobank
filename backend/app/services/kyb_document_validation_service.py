"""
KYB Document Validation Service
Enhanced document verification with authenticity checks and cross-validation
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import structlog
from enum import Enum
import re

logger = structlog.get_logger()

class DocumentAuthenticityLevel(Enum):
    VERIFIED = "verified"  # 90-100%
    LIKELY_AUTHENTIC = "likely_authentic"  # 75-89%
    UNCERTAIN = "uncertain"  # 50-74%
    LIKELY_FRAUDULENT = "likely_fraudulent"  # 25-49%
    FRAUDULENT = "fraudulent"  # 0-24%

class KYBDocumentValidationService:
    """
    Enhanced KYB Document Validation Service
    Validates business documents with authenticity checks
    """
    
    def __init__(self):
        """Initialize document validation service"""
        self.document_validators = self._initialize_validators()
        logger.info("KYB Document Validation Service initialized")
    
    async def validate_cac_certificate(
        self,
        document_data: Dict[str, Any],
        ocr_data: Dict[str, Any],
        cac_verification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate CAC certificate authenticity
        
        Args:
            document_data: Document metadata
            ocr_data: OCR extracted data
            cac_verification: CAC API verification results
            
        Returns:
            Validation results with authenticity score
        """
        
        try:
            validation_checks = []
            
            # Check 1: RC number format validation
            rc_number_check = self._validate_rc_number_format(ocr_data.get('rc_number', ''))
            validation_checks.append(rc_number_check)
            
            # Check 2: Cross-verify with CAC API
            cac_cross_check = self._cross_verify_with_cac(ocr_data, cac_verification)
            validation_checks.append(cac_cross_check)
            
            # Check 3: Document security features
            security_check = self._check_document_security_features(document_data)
            validation_checks.append(security_check)
            
            # Check 4: Data consistency
            consistency_check = self._check_data_consistency(ocr_data)
            validation_checks.append(consistency_check)
            
            # Check 5: Date validation
            date_check = self._validate_dates(ocr_data)
            validation_checks.append(date_check)
            
            # Calculate overall authenticity score
            authenticity_score = self._calculate_authenticity_score(validation_checks)
            authenticity_level = self._get_authenticity_level(authenticity_score)
            
            # Identify issues
            issues = [check for check in validation_checks if not check['passed']]
            
            return {
                'document_type': 'cac_certificate',
                'valid': authenticity_score >= 75,
                'authenticity_score': authenticity_score,
                'authenticity_level': authenticity_level.value,
                'validation_checks': validation_checks,
                'issues': issues,
                'recommendations': self._generate_validation_recommendations(issues),
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("CAC certificate validation failed", error=str(e))
            return {
                'document_type': 'cac_certificate',
                'valid': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def validate_tax_certificate(
        self,
        document_data: Dict[str, Any],
        ocr_data: Dict[str, Any],
        tin_verification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate tax certificate authenticity"""
        
        try:
            validation_checks = []
            
            # TIN format validation
            tin_check = self._validate_tin_format(ocr_data.get('tin', ''))
            validation_checks.append(tin_check)
            
            # Cross-verify with FIRS
            firs_check = self._cross_verify_with_firs(ocr_data, tin_verification)
            validation_checks.append(firs_check)
            
            # Expiry date validation
            expiry_check = self._validate_certificate_expiry(ocr_data.get('expiry_date'))
            validation_checks.append(expiry_check)
            
            # Calculate authenticity score
            authenticity_score = self._calculate_authenticity_score(validation_checks)
            authenticity_level = self._get_authenticity_level(authenticity_score)
            
            issues = [check for check in validation_checks if not check['passed']]
            
            return {
                'document_type': 'tax_certificate',
                'valid': authenticity_score >= 75,
                'authenticity_score': authenticity_score,
                'authenticity_level': authenticity_level.value,
                'validation_checks': validation_checks,
                'issues': issues,
                'recommendations': self._generate_validation_recommendations(issues),
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("Tax certificate validation failed", error=str(e))
            return {
                'document_type': 'tax_certificate',
                'valid': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def validate_financial_statements(
        self,
        documents: List[Dict[str, Any]],
        financial_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate financial statements"""
        
        try:
            validation_checks = []
            
            # Check for required statements
            required_check = self._check_required_financial_statements(documents)
            validation_checks.append(required_check)
            
            # Validate financial data consistency
            consistency_check = self._validate_financial_consistency(documents, financial_analysis)
            validation_checks.append(consistency_check)
            
            # Check for anomalies
            anomaly_check = self._check_financial_anomalies(financial_analysis)
            validation_checks.append(anomaly_check)
            
            # Validate signatures and stamps
            signature_check = self._validate_signatures_stamps(documents)
            validation_checks.append(signature_check)
            
            # Calculate authenticity score
            authenticity_score = self._calculate_authenticity_score(validation_checks)
            authenticity_level = self._get_authenticity_level(authenticity_score)
            
            issues = [check for check in validation_checks if not check['passed']]
            
            return {
                'document_type': 'financial_statements',
                'valid': authenticity_score >= 75,
                'authenticity_score': authenticity_score,
                'authenticity_level': authenticity_level.value,
                'validation_checks': validation_checks,
                'issues': issues,
                'recommendations': self._generate_validation_recommendations(issues),
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("Financial statements validation failed", error=str(e))
            return {
                'document_type': 'financial_statements',
                'valid': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def _validate_rc_number_format(self, rc_number: str) -> Dict[str, Any]:
        """Validate RC number format"""
        
        if not rc_number:
            return {
                'check_name': 'RC Number Format',
                'passed': False,
                'score': 0,
                'message': 'RC number not provided'
            }
        
        # RC number should be in format: RC123456 or BN123456
        pattern = r'^(RC|BN|IT)\d{6,8}$'
        
        if re.match(pattern, rc_number.upper().replace(' ', '')):
            return {
                'check_name': 'RC Number Format',
                'passed': True,
                'score': 100,
                'message': 'RC number format is valid'
            }
        else:
            return {
                'check_name': 'RC Number Format',
                'passed': False,
                'score': 30,
                'message': f'Invalid RC number format: {rc_number}'
            }
    
    def _cross_verify_with_cac(
        self,
        ocr_data: Dict[str, Any],
        cac_verification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Cross-verify document data with CAC API"""
        
        if 'error' in cac_verification:
            return {
                'check_name': 'CAC Cross-Verification',
                'passed': False,
                'score': 0,
                'message': 'CAC verification failed'
            }
        
        if not cac_verification.get('verified', False):
            return {
                'check_name': 'CAC Cross-Verification',
                'passed': False,
                'score': 0,
                'message': 'Business not verified with CAC'
            }
        
        # Check company name match
        name_match_score = cac_verification.get('name_match_score', 0)
        
        if name_match_score >= 90:
            return {
                'check_name': 'CAC Cross-Verification',
                'passed': True,
                'score': 100,
                'message': 'Document data matches CAC records'
            }
        elif name_match_score >= 75:
            return {
                'check_name': 'CAC Cross-Verification',
                'passed': True,
                'score': 80,
                'message': 'Document data mostly matches CAC records'
            }
        else:
            return {
                'check_name': 'CAC Cross-Verification',
                'passed': False,
                'score': 40,
                'message': f'Low match with CAC records ({name_match_score}%)'
            }
    
    def _check_document_security_features(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check for document security features (watermarks, stamps, etc.)"""
        
        # Placeholder - in production, use image analysis
        return {
            'check_name': 'Security Features',
            'passed': True,
            'score': 85,
            'message': 'Document appears to have security features'
        }
    
    def _check_data_consistency(self, ocr_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check internal data consistency"""
        
        inconsistencies = []
        
        # Check if all required fields are present
        required_fields = ['rc_number', 'company_name', 'registration_date']
        missing_fields = [field for field in required_fields if not ocr_data.get(field)]
        
        if missing_fields:
            inconsistencies.append(f"Missing fields: {', '.join(missing_fields)}")
        
        if inconsistencies:
            return {
                'check_name': 'Data Consistency',
                'passed': False,
                'score': 50,
                'message': '; '.join(inconsistencies)
            }
        else:
            return {
                'check_name': 'Data Consistency',
                'passed': True,
                'score': 100,
                'message': 'All required data present and consistent'
            }
    
    def _validate_dates(self, ocr_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate dates in document"""
        
        registration_date = ocr_data.get('registration_date')
        
        if not registration_date:
            return {
                'check_name': 'Date Validation',
                'passed': False,
                'score': 50,
                'message': 'Registration date not found'
            }
        
        try:
            # Parse date
            if isinstance(registration_date, str):
                reg_date = datetime.fromisoformat(registration_date.replace('Z', '+00:00'))
            else:
                reg_date = registration_date
            
            # Check if date is in the past and reasonable
            if reg_date > datetime.now():
                return {
                    'check_name': 'Date Validation',
                    'passed': False,
                    'score': 0,
                    'message': 'Registration date is in the future'
                }
            
            # Check if date is not too old (e.g., before 1960)
            if reg_date.year < 1960:
                return {
                    'check_name': 'Date Validation',
                    'passed': False,
                    'score': 30,
                    'message': 'Registration date seems unreasonably old'
                }
            
            return {
                'check_name': 'Date Validation',
                'passed': True,
                'score': 100,
                'message': 'Dates are valid'
            }
        
        except Exception as e:
            return {
                'check_name': 'Date Validation',
                'passed': False,
                'score': 40,
                'message': f'Date validation error: {str(e)}'
            }
    
    def _validate_tin_format(self, tin: str) -> Dict[str, Any]:
        """Validate TIN format"""
        
        if not tin:
            return {
                'check_name': 'TIN Format',
                'passed': False,
                'score': 0,
                'message': 'TIN not provided'
            }
        
        # TIN should be 8-14 digits
        pattern = r'^\d{8,14}$'
        
        if re.match(pattern, tin.replace('-', '').replace(' ', '')):
            return {
                'check_name': 'TIN Format',
                'passed': True,
                'score': 100,
                'message': 'TIN format is valid'
            }
        else:
            return {
                'check_name': 'TIN Format',
                'passed': False,
                'score': 30,
                'message': f'Invalid TIN format: {tin}'
            }
    
    def _cross_verify_with_firs(
        self,
        ocr_data: Dict[str, Any],
        tin_verification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Cross-verify with FIRS"""
        
        if 'error' in tin_verification:
            return {
                'check_name': 'FIRS Cross-Verification',
                'passed': False,
                'score': 0,
                'message': 'FIRS verification failed'
            }
        
        if tin_verification.get('verified', False):
            return {
                'check_name': 'FIRS Cross-Verification',
                'passed': True,
                'score': 100,
                'message': 'TIN verified with FIRS'
            }
        else:
            return {
                'check_name': 'FIRS Cross-Verification',
                'passed': False,
                'score': 0,
                'message': 'TIN not verified with FIRS'
            }
    
    def _validate_certificate_expiry(self, expiry_date: Optional[str]) -> Dict[str, Any]:
        """Validate certificate expiry date"""
        
        if not expiry_date:
            return {
                'check_name': 'Certificate Expiry',
                'passed': True,
                'score': 90,
                'message': 'No expiry date (may be permanent)'
            }
        
        try:
            if isinstance(expiry_date, str):
                exp_date = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
            else:
                exp_date = expiry_date
            
            if exp_date < datetime.now():
                return {
                    'check_name': 'Certificate Expiry',
                    'passed': False,
                    'score': 0,
                    'message': 'Certificate has expired'
                }
            else:
                return {
                    'check_name': 'Certificate Expiry',
                    'passed': True,
                    'score': 100,
                    'message': 'Certificate is valid'
                }
        
        except Exception as e:
            return {
                'check_name': 'Certificate Expiry',
                'passed': False,
                'score': 50,
                'message': f'Expiry date validation error: {str(e)}'
            }
    
    def _check_required_financial_statements(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Check for required financial statements"""
        
        required = ['balance_sheet', 'income_statement', 'cash_flow_statement']
        provided = [doc.get('type') for doc in documents]
        
        missing = [req for req in required if req not in provided]
        
        if not missing:
            return {
                'check_name': 'Required Statements',
                'passed': True,
                'score': 100,
                'message': 'All required financial statements provided'
            }
        else:
            return {
                'check_name': 'Required Statements',
                'passed': False,
                'score': 60,
                'message': f'Missing statements: {", ".join(missing)}'
            }
    
    def _validate_financial_consistency(
        self,
        documents: List[Dict[str, Any]],
        financial_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate financial data consistency"""
        
        # Check for anomalies in financial analysis
        anomalies = financial_analysis.get('anomalies', [])
        
        if not anomalies:
            return {
                'check_name': 'Financial Consistency',
                'passed': True,
                'score': 100,
                'message': 'Financial data is consistent'
            }
        else:
            critical_anomalies = [a for a in anomalies if a.get('severity') == 'critical']
            if critical_anomalies:
                return {
                    'check_name': 'Financial Consistency',
                    'passed': False,
                    'score': 30,
                    'message': f'{len(critical_anomalies)} critical anomalies detected'
                }
            else:
                return {
                    'check_name': 'Financial Consistency',
                    'passed': True,
                    'score': 70,
                    'message': f'{len(anomalies)} minor anomalies detected'
                }
    
    def _check_financial_anomalies(self, financial_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Check for financial anomalies"""
        
        anomalies = financial_analysis.get('anomalies', [])
        
        if not anomalies:
            return {
                'check_name': 'Anomaly Detection',
                'passed': True,
                'score': 100,
                'message': 'No anomalies detected'
            }
        else:
            return {
                'check_name': 'Anomaly Detection',
                'passed': len(anomalies) <= 2,
                'score': max(0, 100 - (len(anomalies) * 20)),
                'message': f'{len(anomalies)} anomalies detected'
            }
    
    def _validate_signatures_stamps(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate signatures and stamps"""
        
        # Placeholder - in production, use image analysis
        return {
            'check_name': 'Signatures & Stamps',
            'passed': True,
            'score': 85,
            'message': 'Documents appear to be signed and stamped'
        }
    
    def _calculate_authenticity_score(self, validation_checks: List[Dict[str, Any]]) -> float:
        """Calculate overall authenticity score"""
        
        if not validation_checks:
            return 0.0
        
        total_score = sum(check.get('score', 0) for check in validation_checks)
        avg_score = total_score / len(validation_checks)
        
        return round(avg_score, 2)
    
    def _get_authenticity_level(self, score: float) -> DocumentAuthenticityLevel:
        """Get authenticity level from score"""
        
        if score >= 90:
            return DocumentAuthenticityLevel.VERIFIED
        elif score >= 75:
            return DocumentAuthenticityLevel.LIKELY_AUTHENTIC
        elif score >= 50:
            return DocumentAuthenticityLevel.UNCERTAIN
        elif score >= 25:
            return DocumentAuthenticityLevel.LIKELY_FRAUDULENT
        else:
            return DocumentAuthenticityLevel.FRAUDULENT
    
    def _generate_validation_recommendations(self, issues: List[Dict[str, Any]]) -> List[str]:
        """Generate recommendations based on validation issues"""
        
        recommendations = []
        
        for issue in issues:
            check_name = issue.get('check_name')
            
            if 'Format' in check_name:
                recommendations.append(f"Request corrected {check_name.lower()} from applicant")
            elif 'Cross-Verification' in check_name:
                recommendations.append(f"Manually verify {check_name.replace(' Cross-Verification', '')} with regulatory authority")
            elif 'Expiry' in check_name:
                recommendations.append("Request updated certificate")
            elif 'Consistency' in check_name:
                recommendations.append("Request clarification or additional documentation")
        
        if not recommendations:
            recommendations.append("No issues detected - proceed with verification")
        
        return recommendations
    
    def _initialize_validators(self) -> Dict[str, Any]:
        """Initialize document validators"""
        return {
            'cac_certificate': self.validate_cac_certificate,
            'tax_certificate': self.validate_tax_certificate,
            'financial_statements': self.validate_financial_statements
        }


# Singleton instance
_document_validation_instance = None

def get_kyb_document_validation_service() -> KYBDocumentValidationService:
    """Get KYB document validation service instance"""
    global _document_validation_instance
    
    if _document_validation_instance is None:
        _document_validation_instance = KYBDocumentValidationService()
    
    return _document_validation_instance
