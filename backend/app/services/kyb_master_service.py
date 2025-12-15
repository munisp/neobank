"""
KYB Master Service
Orchestrates all KYB components for comprehensive business verification
"""

import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
import structlog

from .cac_verification_service import get_cac_service
from .financial_analysis_service import get_financial_analysis_service
from .kyb_risk_scoring_service import get_kyb_risk_scoring_service
from .kyb_screening_service import get_kyb_screening_service
from .kyb_document_validation_service import get_kyb_document_validation_service

logger = structlog.get_logger()

class KYBMasterService:
    """
    KYB Master Service - Comprehensive Business Verification
    Orchestrates all KYB components for end-to-end verification
    """
    
    def __init__(self):
        """Initialize KYB master service"""
        self.cac_service = get_cac_service()
        self.financial_service = get_financial_analysis_service()
        self.risk_service = get_kyb_risk_scoring_service()
        self.screening_service = get_kyb_screening_service()
        self.document_service = get_kyb_document_validation_service()
        
        logger.info("KYB Master Service initialized")
    
    async def perform_comprehensive_kyb(
        self,
        business_data: Dict[str, Any],
        documents: List[Dict[str, Any]],
        ubos: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Perform comprehensive KYB verification
        
        Args:
            business_data: Business profile information
            documents: List of business documents
            ubos: List of Ultimate Beneficial Owners
            
        Returns:
            Complete KYB verification results
        """
        
        try:
            logger.info("Starting comprehensive KYB", business_name=business_data.get('business_name'))
            
            # Step 1: CAC Verification
            logger.info("Step 1: CAC Verification")
            cac_result = await self.cac_service.verify_rc_number(
                rc_number=business_data.get('rc_number'),
                company_name=business_data.get('business_name')
            )
            
            # Step 2: TIN Verification
            logger.info("Step 2: TIN Verification")
            tin_result = await self.cac_service.verify_tin(
                tin=business_data.get('tin'),
                company_name=business_data.get('business_name')
            )
            
            # Step 3: Director Verification
            logger.info("Step 3: Director Verification")
            directors = business_data.get('directors', [])
            director_result = await self.cac_service.verify_directors(
                rc_number=business_data.get('rc_number'),
                directors=directors
            )
            
            # Step 4: Compliance Check
            logger.info("Step 4: Compliance Check")
            compliance_result = await self.cac_service.check_compliance_status(
                rc_number=business_data.get('rc_number')
            )
            
            # Step 5: Financial Analysis
            logger.info("Step 5: Financial Analysis")
            financial_data = business_data.get('financial_data', {})
            financial_result = await self.financial_service.analyze_financial_statements(
                financial_data=financial_data,
                industry=business_data.get('industry', 'general')
            )
            
            # Step 6: Bank Statement Analysis
            logger.info("Step 6: Bank Statement Analysis")
            bank_statements = business_data.get('bank_statements', [])
            banking_result = await self.financial_service.analyze_bank_statements(
                bank_statements=bank_statements,
                period_months=6
            )
            
            # Step 7: Business Screening
            logger.info("Step 7: Business Screening")
            business_screening = await self.screening_service.screen_business(
                business_name=business_data.get('business_name'),
                registration_number=business_data.get('rc_number'),
                country=business_data.get('country', 'NG')
            )
            
            # Step 8: UBO Screening
            logger.info("Step 8: UBO Screening")
            ubo_screening_results = []
            for ubo in ubos:
                ubo_result = await self.screening_service.screen_business_owner(
                    full_name=ubo.get('full_name'),
                    date_of_birth=ubo.get('date_of_birth'),
                    nationality=ubo.get('nationality'),
                    business_name=business_data.get('business_name')
                )
                ubo_screening_results.append(ubo_result)
            
            # Step 9: Document Validation
            logger.info("Step 9: Document Validation")
            document_validations = []
            for doc in documents:
                if doc.get('type') == 'cac_certificate':
                    validation = await self.document_service.validate_cac_certificate(
                        document_data=doc,
                        ocr_data=doc.get('ocr_data', {}),
                        cac_verification=cac_result
                    )
                    document_validations.append(validation)
                elif doc.get('type') == 'tax_certificate':
                    validation = await self.document_service.validate_tax_certificate(
                        document_data=doc,
                        ocr_data=doc.get('ocr_data', {}),
                        tin_verification=tin_result
                    )
                    document_validations.append(validation)
            
            # Calculate document verification summary
            doc_summary = self._summarize_document_validation(document_validations)
            
            # Step 10: Comprehensive Risk Scoring
            logger.info("Step 10: Comprehensive Risk Scoring")
            risk_assessment = await self.risk_service.calculate_comprehensive_risk_score(
                business_data=business_data,
                cac_verification=cac_result,
                financial_analysis=financial_result,
                ubo_screening=ubo_screening_results,
                document_verification=doc_summary
            )
            
            # Generate final KYB report
            kyb_report = {
                'business_name': business_data.get('business_name'),
                'rc_number': business_data.get('rc_number'),
                'kyb_status': self._determine_kyb_status(risk_assessment),
                'risk_assessment': risk_assessment,
                'verification_results': {
                    'cac_verification': cac_result,
                    'tin_verification': tin_result,
                    'director_verification': director_result,
                    'compliance_check': compliance_result
                },
                'financial_assessment': {
                    'financial_analysis': financial_result,
                    'banking_analysis': banking_result
                },
                'screening_results': {
                    'business_screening': business_screening,
                    'ubo_screening': ubo_screening_results
                },
                'document_validation': {
                    'summary': doc_summary,
                    'details': document_validations
                },
                'recommendations': self._generate_final_recommendations(risk_assessment),
                'next_steps': self._determine_next_steps(risk_assessment),
                'timestamp': datetime.now().isoformat()
            }
            
            logger.info(
                "KYB verification complete",
                business_name=business_data.get('business_name'),
                status=kyb_report['kyb_status'],
                risk_score=risk_assessment.get('total_risk_score')
            )
            
            return kyb_report
        
        except Exception as e:
            logger.error("KYB verification failed", error=str(e))
            return {
                'business_name': business_data.get('business_name'),
                'kyb_status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def _summarize_document_validation(self, validations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Summarize document validation results"""
        
        if not validations:
            return {
                'total_documents': 0,
                'verified_documents': 0,
                'average_confidence': 0
            }
        
        total = len(validations)
        verified = sum(1 for v in validations if v.get('valid', False))
        avg_confidence = sum(v.get('authenticity_score', 0) for v in validations) / total
        
        return {
            'total_documents': total,
            'verified_documents': verified,
            'average_confidence': round(avg_confidence, 2),
            'verification_rate': round((verified / total) * 100, 2) if total > 0 else 0
        }
    
    def _determine_kyb_status(self, risk_assessment: Dict[str, Any]) -> str:
        """Determine overall KYB status"""
        
        decision = risk_assessment.get('decision', 'manual_review')
        
        if decision == 'auto_approve':
            return 'approved'
        elif decision == 'auto_reject':
            return 'rejected'
        elif decision == 'enhanced_due_diligence':
            return 'enhanced_due_diligence_required'
        else:
            return 'manual_review_required'
    
    def _generate_final_recommendations(self, risk_assessment: Dict[str, Any]) -> List[str]:
        """Generate final recommendations"""
        
        recommendations = risk_assessment.get('recommendations', [])
        
        # Add additional recommendations based on risk tier
        risk_tier = risk_assessment.get('risk_tier', 'medium')
        
        if risk_tier in ['high', 'very_high']:
            recommendations.append("Consider declining application or imposing strict conditions")
            recommendations.append("Escalate to senior management for final decision")
        elif risk_tier == 'medium':
            recommendations.append("Proceed with enhanced monitoring")
        else:
            recommendations.append("Proceed with standard monitoring")
        
        return recommendations
    
    def _determine_next_steps(self, risk_assessment: Dict[str, Any]) -> List[str]:
        """Determine next steps"""
        
        decision = risk_assessment.get('decision', 'manual_review')
        
        if decision == 'auto_approve':
            return [
                "Onboard business customer",
                "Set up account and services",
                "Implement standard transaction monitoring"
            ]
        elif decision == 'auto_reject':
            return [
                "Send rejection notification to applicant",
                "File SAR (Suspicious Activity Report) if required",
                "Archive case documentation"
            ]
        elif decision == 'enhanced_due_diligence':
            return [
                "Request additional documentation",
                "Conduct site visit if required",
                "Perform enhanced background checks",
                "Escalate to compliance officer"
            ]
        else:
            return [
                "Assign to compliance officer for manual review",
                "Request clarification on flagged items",
                "Make final decision within 5 business days"
            ]


# Singleton instance
_kyb_master_instance = None

def get_kyb_master_service() -> KYBMasterService:
    """Get KYB master service instance"""
    global _kyb_master_instance
    
    if _kyb_master_instance is None:
        _kyb_master_instance = KYBMasterService()
    
    return _kyb_master_instance
