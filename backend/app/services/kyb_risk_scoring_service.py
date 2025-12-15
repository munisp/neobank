"""
KYB Risk Scoring Service
Advanced multi-factor risk assessment for business verification
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from decimal import Decimal
import structlog
from enum import Enum

logger = structlog.get_logger()

class RiskTier(Enum):
    VERY_LOW = "very_low"  # 0-20
    LOW = "low"  # 21-40
    MEDIUM = "medium"  # 41-60
    HIGH = "high"  # 61-80
    VERY_HIGH = "very_high"  # 81-100

class DecisionType(Enum):
    AUTO_APPROVE = "auto_approve"
    MANUAL_REVIEW = "manual_review"
    ENHANCED_DUE_DILIGENCE = "enhanced_due_diligence"
    AUTO_REJECT = "auto_reject"

class IndustryRiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"

class KYBRiskScoringService:
    """
    Advanced KYB Risk Scoring Service
    Multi-factor risk assessment with industry-specific models
    """
    
    def __init__(self):
        """Initialize KYB risk scoring service"""
        self.industry_risk_mapping = self._load_industry_risk_mapping()
        self.country_risk_scores = self._load_country_risk_scores()
        logger.info("KYB Risk Scoring Service initialized")
    
    async def calculate_comprehensive_risk_score(
        self,
        business_data: Dict[str, Any],
        cac_verification: Dict[str, Any],
        financial_analysis: Dict[str, Any],
        ubo_screening: List[Dict[str, Any]],
        document_verification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Calculate comprehensive KYB risk score (0-100)
        Lower score = lower risk
        
        Args:
            business_data: Business profile information
            cac_verification: CAC verification results
            financial_analysis: Financial health analysis
            ubo_screening: UBO screening results
            document_verification: Document verification results
            
        Returns:
            Complete risk assessment with score and decision
        """
        
        try:
            # Calculate individual risk factors
            business_age_risk = self._calculate_business_age_risk(business_data)
            industry_risk = self._calculate_industry_risk(business_data)
            geographic_risk = self._calculate_geographic_risk(business_data)
            financial_risk = self._calculate_financial_risk(financial_analysis)
            ubo_risk = self._calculate_ubo_risk(ubo_screening)
            document_risk = self._calculate_document_risk(document_verification)
            regulatory_risk = self._calculate_regulatory_risk(cac_verification)
            
            # Weight factors
            weights = {
                'business_age': 0.10,  # 10%
                'industry': 0.20,  # 20%
                'geographic': 0.15,  # 15%
                'financial': 0.25,  # 25%
                'ubo': 0.15,  # 15%
                'document': 0.10,  # 10%
                'regulatory': 0.05  # 5%
            }
            
            # Calculate weighted total risk score
            total_risk_score = (
                business_age_risk * weights['business_age'] +
                industry_risk * weights['industry'] +
                geographic_risk * weights['geographic'] +
                financial_risk * weights['financial'] +
                ubo_risk * weights['ubo'] +
                document_risk * weights['document'] +
                regulatory_risk * weights['regulatory']
            )
            
            # Determine risk tier
            risk_tier = self._get_risk_tier(total_risk_score)
            
            # Make decision
            decision = self._make_decision(total_risk_score, risk_tier, business_data, ubo_screening)
            
            # Generate risk factors breakdown
            risk_factors = {
                'business_age': {
                    'score': round(business_age_risk, 2),
                    'weight': weights['business_age'],
                    'weighted_score': round(business_age_risk * weights['business_age'], 2),
                    'details': self._get_business_age_details(business_data)
                },
                'industry': {
                    'score': round(industry_risk, 2),
                    'weight': weights['industry'],
                    'weighted_score': round(industry_risk * weights['industry'], 2),
                    'details': self._get_industry_details(business_data)
                },
                'geographic': {
                    'score': round(geographic_risk, 2),
                    'weight': weights['geographic'],
                    'weighted_score': round(geographic_risk * weights['geographic'], 2),
                    'details': self._get_geographic_details(business_data)
                },
                'financial': {
                    'score': round(financial_risk, 2),
                    'weight': weights['financial'],
                    'weighted_score': round(financial_risk * weights['financial'], 2),
                    'details': self._get_financial_details(financial_analysis)
                },
                'ubo': {
                    'score': round(ubo_risk, 2),
                    'weight': weights['ubo'],
                    'weighted_score': round(ubo_risk * weights['ubo'], 2),
                    'details': self._get_ubo_details(ubo_screening)
                },
                'document': {
                    'score': round(document_risk, 2),
                    'weight': weights['document'],
                    'weighted_score': round(document_risk * weights['document'], 2),
                    'details': self._get_document_details(document_verification)
                },
                'regulatory': {
                    'score': round(regulatory_risk, 2),
                    'weight': weights['regulatory'],
                    'weighted_score': round(regulatory_risk * weights['regulatory'], 2),
                    'details': self._get_regulatory_details(cac_verification)
                }
            }
            
            # Generate recommendations
            recommendations = self._generate_recommendations(
                total_risk_score,
                risk_tier,
                risk_factors,
                decision
            )
            
            # Identify red flags
            red_flags = self._identify_red_flags(
                business_data,
                cac_verification,
                financial_analysis,
                ubo_screening,
                document_verification
            )
            
            return {
                'total_risk_score': round(total_risk_score, 2),
                'risk_tier': risk_tier.value,
                'decision': decision['type'].value,
                'decision_reason': decision['reason'],
                'risk_factors': risk_factors,
                'red_flags': red_flags,
                'recommendations': recommendations,
                'requires_enhanced_due_diligence': decision['type'] == DecisionType.ENHANCED_DUE_DILIGENCE,
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("Risk scoring failed", error=str(e))
            return {
                'total_risk_score': 100,  # Maximum risk on error
                'risk_tier': RiskTier.VERY_HIGH.value,
                'decision': DecisionType.MANUAL_REVIEW.value,
                'decision_reason': f'Risk scoring error: {str(e)}',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def _calculate_business_age_risk(self, business_data: Dict[str, Any]) -> float:
        """
        Calculate risk based on business age (0-100)
        Newer businesses = higher risk
        """
        
        incorporation_date = business_data.get('incorporation_date')
        if not incorporation_date:
            return 80.0  # High risk if no date provided
        
        try:
            if isinstance(incorporation_date, str):
                inc_date = datetime.fromisoformat(incorporation_date.replace('Z', '+00:00'))
            else:
                inc_date = incorporation_date
            
            age_years = (datetime.now() - inc_date).days / 365.25
            
            # Risk scoring by age
            if age_years < 1:
                return 80.0  # Very high risk
            elif age_years < 2:
                return 60.0  # High risk
            elif age_years < 3:
                return 40.0  # Medium risk
            elif age_years < 5:
                return 25.0  # Low-medium risk
            else:
                return 10.0  # Low risk
        
        except Exception as e:
            logger.warning("Business age calculation failed", error=str(e))
            return 70.0
    
    def _calculate_industry_risk(self, business_data: Dict[str, Any]) -> float:
        """Calculate risk based on industry (0-100)"""
        
        industry = business_data.get('industry', 'unknown').lower()
        
        # Get industry risk level
        industry_risk_level = self.industry_risk_mapping.get(industry, IndustryRiskLevel.MEDIUM)
        
        # Convert to score
        risk_scores = {
            IndustryRiskLevel.LOW: 15.0,
            IndustryRiskLevel.MEDIUM: 40.0,
            IndustryRiskLevel.HIGH: 70.0,
            IndustryRiskLevel.VERY_HIGH: 90.0
        }
        
        return risk_scores[industry_risk_level]
    
    def _calculate_geographic_risk(self, business_data: Dict[str, Any]) -> float:
        """Calculate risk based on geographic location (0-100)"""
        
        # Extract country/region from address
        address = business_data.get('business_address', '').lower()
        
        # Default to Nigeria (medium-low risk)
        country_risk = 30.0
        
        # Check for high-risk regions
        high_risk_keywords = ['borno', 'yobe', 'adamawa', 'border', 'conflict']
        for keyword in high_risk_keywords:
            if keyword in address:
                country_risk = 60.0
                break
        
        return country_risk
    
    def _calculate_financial_risk(self, financial_analysis: Dict[str, Any]) -> float:
        """Calculate risk based on financial health (0-100)"""
        
        if 'error' in financial_analysis:
            return 80.0  # High risk if analysis failed
        
        # Get financial health score (0-100, higher is better)
        health_score = financial_analysis.get('financial_health_score', 0)
        
        # Invert for risk (lower health = higher risk)
        financial_risk = 100 - health_score
        
        # Get default probability
        default_prob = financial_analysis.get('default_probability', 50)
        
        # Combine (70% health, 30% default probability)
        combined_risk = (financial_risk * 0.7) + (default_prob * 0.3)
        
        return round(combined_risk, 2)
    
    def _calculate_ubo_risk(self, ubo_screening: List[Dict[str, Any]]) -> float:
        """Calculate risk based on UBO screening results (0-100)"""
        
        if not ubo_screening:
            return 70.0  # High risk if no UBOs provided
        
        total_risk = 0
        
        for ubo in ubo_screening:
            ubo_risk = 0
            
            # Check sanctions screening
            sanctions_status = ubo.get('sanctions_check', {}).get('status', 'unknown')
            if sanctions_status == 'match':
                ubo_risk += 100  # Critical risk
            elif sanctions_status == 'potential_match':
                ubo_risk += 60  # High risk
            else:
                ubo_risk += 5  # Low risk
            
            # Check PEP status
            pep_status = ubo.get('pep_check', {}).get('status', 'unknown')
            if pep_status == 'match':
                ubo_risk += 50  # Medium-high risk
            elif pep_status == 'potential_match':
                ubo_risk += 30  # Medium risk
            else:
                ubo_risk += 5  # Low risk
            
            total_risk += ubo_risk
        
        # Average risk across all UBOs
        avg_risk = total_risk / len(ubo_screening) if ubo_screening else 70
        
        return min(100, round(avg_risk, 2))
    
    def _calculate_document_risk(self, document_verification: Dict[str, Any]) -> float:
        """Calculate risk based on document verification (0-100)"""
        
        if not document_verification:
            return 80.0  # High risk if no documents
        
        # Get document verification metrics
        total_docs = document_verification.get('total_documents', 0)
        verified_docs = document_verification.get('verified_documents', 0)
        avg_confidence = document_verification.get('average_confidence', 0)
        
        if total_docs == 0:
            return 80.0
        
        # Calculate verification rate
        verification_rate = (verified_docs / total_docs) * 100
        
        # Risk based on verification rate and confidence
        if verification_rate >= 90 and avg_confidence >= 85:
            return 10.0  # Low risk
        elif verification_rate >= 75 and avg_confidence >= 70:
            return 30.0  # Low-medium risk
        elif verification_rate >= 60 and avg_confidence >= 60:
            return 50.0  # Medium risk
        elif verification_rate >= 40:
            return 70.0  # High risk
        else:
            return 90.0  # Very high risk
    
    def _calculate_regulatory_risk(self, cac_verification: Dict[str, Any]) -> float:
        """Calculate risk based on regulatory compliance (0-100)"""
        
        if not cac_verification or 'error' in cac_verification:
            return 75.0  # High risk if verification failed
        
        risk = 0
        
        # Check verification status
        if not cac_verification.get('verified', False):
            risk += 80  # Very high risk
        
        # Check business status
        status = cac_verification.get('status', '').lower()
        if status in ['struck_off', 'dissolved', 'in_liquidation']:
            risk += 100  # Critical risk
        elif status in ['inactive', 'suspended']:
            risk += 60  # High risk
        elif status == 'active':
            risk += 5  # Low risk
        else:
            risk += 40  # Medium risk
        
        # Check for warnings
        warnings = cac_verification.get('warnings', [])
        risk += len(warnings) * 10  # 10 points per warning
        
        return min(100, round(risk, 2))
    
    def _get_risk_tier(self, risk_score: float) -> RiskTier:
        """Get risk tier from score"""
        if risk_score <= 20:
            return RiskTier.VERY_LOW
        elif risk_score <= 40:
            return RiskTier.LOW
        elif risk_score <= 60:
            return RiskTier.MEDIUM
        elif risk_score <= 80:
            return RiskTier.HIGH
        else:
            return RiskTier.VERY_HIGH
    
    def _make_decision(
        self,
        risk_score: float,
        risk_tier: RiskTier,
        business_data: Dict[str, Any],
        ubo_screening: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Make KYB decision based on risk score"""
        
        # Check for automatic rejection criteria
        for ubo in ubo_screening:
            if ubo.get('sanctions_check', {}).get('status') == 'match':
                return {
                    'type': DecisionType.AUTO_REJECT,
                    'reason': 'UBO matched on sanctions list'
                }
        
        # Decision based on risk tier
        if risk_tier == RiskTier.VERY_LOW:
            return {
                'type': DecisionType.AUTO_APPROVE,
                'reason': 'Very low risk profile - all checks passed'
            }
        elif risk_tier == RiskTier.LOW:
            return {
                'type': DecisionType.AUTO_APPROVE,
                'reason': 'Low risk profile - standard verification complete'
            }
        elif risk_tier == RiskTier.MEDIUM:
            return {
                'type': DecisionType.MANUAL_REVIEW,
                'reason': 'Medium risk - requires manual review'
            }
        elif risk_tier == RiskTier.HIGH:
            return {
                'type': DecisionType.ENHANCED_DUE_DILIGENCE,
                'reason': 'High risk - enhanced due diligence required'
            }
        else:  # VERY_HIGH
            return {
                'type': DecisionType.ENHANCED_DUE_DILIGENCE,
                'reason': 'Very high risk - comprehensive enhanced due diligence required'
            }
    
    def _generate_recommendations(
        self,
        risk_score: float,
        risk_tier: RiskTier,
        risk_factors: Dict[str, Any],
        decision: Dict[str, Any]
    ) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []
        
        # Financial recommendations
        if risk_factors['financial']['score'] > 60:
            recommendations.append("Request additional financial documentation and analysis")
            recommendations.append("Consider requiring personal guarantees from directors")
        
        # UBO recommendations
        if risk_factors['ubo']['score'] > 50:
            recommendations.append("Conduct enhanced UBO screening and verification")
            recommendations.append("Request source of wealth documentation")
        
        # Industry recommendations
        if risk_factors['industry']['score'] > 70:
            recommendations.append("Apply enhanced monitoring for high-risk industry")
            recommendations.append("Implement transaction monitoring controls")
        
        # Document recommendations
        if risk_factors['document']['score'] > 50:
            recommendations.append("Request additional supporting documents")
            recommendations.append("Verify documents through independent sources")
        
        # General recommendations
        if risk_tier in [RiskTier.HIGH, RiskTier.VERY_HIGH]:
            recommendations.append("Escalate to senior compliance officer")
            recommendations.append("Consider declining or imposing strict conditions")
        
        return recommendations
    
    def _identify_red_flags(
        self,
        business_data: Dict[str, Any],
        cac_verification: Dict[str, Any],
        financial_analysis: Dict[str, Any],
        ubo_screening: List[Dict[str, Any]],
        document_verification: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Identify red flags"""
        red_flags = []
        
        # CAC red flags
        if not cac_verification.get('verified', False):
            red_flags.append({
                'category': 'regulatory',
                'severity': 'critical',
                'description': 'Business registration not verified with CAC'
            })
        
        # Financial red flags
        if financial_analysis.get('default_probability', 0) > 70:
            red_flags.append({
                'category': 'financial',
                'severity': 'high',
                'description': 'High probability of default (>70%)'
            })
        
        # UBO red flags
        for ubo in ubo_screening:
            if ubo.get('sanctions_check', {}).get('status') == 'match':
                red_flags.append({
                    'category': 'ubo',
                    'severity': 'critical',
                    'description': f"UBO {ubo.get('full_name')} matched on sanctions list"
                })
        
        return red_flags
    
    def _get_business_age_details(self, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get business age details"""
        incorporation_date = business_data.get('incorporation_date')
        if incorporation_date:
            try:
                if isinstance(incorporation_date, str):
                    inc_date = datetime.fromisoformat(incorporation_date.replace('Z', '+00:00'))
                else:
                    inc_date = incorporation_date
                age_years = round((datetime.now() - inc_date).days / 365.25, 1)
                return {'age_years': age_years, 'incorporation_date': inc_date.isoformat()}
            except:
                pass
        return {'age_years': 0, 'incorporation_date': None}
    
    def _get_industry_details(self, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get industry details"""
        industry = business_data.get('industry', 'unknown')
        risk_level = self.industry_risk_mapping.get(industry.lower(), IndustryRiskLevel.MEDIUM)
        return {'industry': industry, 'risk_level': risk_level.value}
    
    def _get_geographic_details(self, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get geographic details"""
        return {'address': business_data.get('business_address', 'unknown')}
    
    def _get_financial_details(self, financial_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Get financial details"""
        return {
            'health_score': financial_analysis.get('financial_health_score', 0),
            'default_probability': financial_analysis.get('default_probability', 0),
            'health_rating': financial_analysis.get('health_rating', 'unknown')
        }
    
    def _get_ubo_details(self, ubo_screening: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get UBO details"""
        return {
            'total_ubos': len(ubo_screening),
            'sanctions_matches': sum(1 for u in ubo_screening if u.get('sanctions_check', {}).get('status') == 'match'),
            'pep_matches': sum(1 for u in ubo_screening if u.get('pep_check', {}).get('status') == 'match')
        }
    
    def _get_document_details(self, document_verification: Dict[str, Any]) -> Dict[str, Any]:
        """Get document details"""
        return {
            'total_documents': document_verification.get('total_documents', 0),
            'verified_documents': document_verification.get('verified_documents', 0),
            'average_confidence': document_verification.get('average_confidence', 0)
        }
    
    def _get_regulatory_details(self, cac_verification: Dict[str, Any]) -> Dict[str, Any]:
        """Get regulatory details"""
        return {
            'verified': cac_verification.get('verified', False),
            'status': cac_verification.get('status', 'unknown'),
            'warnings_count': len(cac_verification.get('warnings', []))
        }
    
    def _load_industry_risk_mapping(self) -> Dict[str, IndustryRiskLevel]:
        """Load industry risk mapping"""
        return {
            # Very High Risk
            'cryptocurrency': IndustryRiskLevel.VERY_HIGH,
            'forex': IndustryRiskLevel.VERY_HIGH,
            'gambling': IndustryRiskLevel.VERY_HIGH,
            'cannabis': IndustryRiskLevel.VERY_HIGH,
            'adult_entertainment': IndustryRiskLevel.VERY_HIGH,
            'weapons': IndustryRiskLevel.VERY_HIGH,
            
            # High Risk
            'money_transfer': IndustryRiskLevel.HIGH,
            'precious_metals': IndustryRiskLevel.HIGH,
            'jewelry': IndustryRiskLevel.HIGH,
            'art_dealing': IndustryRiskLevel.HIGH,
            'real_estate': IndustryRiskLevel.HIGH,
            'import_export': IndustryRiskLevel.HIGH,
            
            # Medium Risk
            'construction': IndustryRiskLevel.MEDIUM,
            'hospitality': IndustryRiskLevel.MEDIUM,
            'transportation': IndustryRiskLevel.MEDIUM,
            'logistics': IndustryRiskLevel.MEDIUM,
            'consulting': IndustryRiskLevel.MEDIUM,
            
            # Low Risk
            'retail': IndustryRiskLevel.LOW,
            'manufacturing': IndustryRiskLevel.LOW,
            'technology': IndustryRiskLevel.LOW,
            'healthcare': IndustryRiskLevel.LOW,
            'education': IndustryRiskLevel.LOW,
            'agriculture': IndustryRiskLevel.LOW
        }
    
    def _load_country_risk_scores(self) -> Dict[str, float]:
        """Load country risk scores"""
        return {
            'nigeria': 30.0,
            'ghana': 25.0,
            'kenya': 28.0,
            'south_africa': 22.0,
            'usa': 10.0,
            'uk': 12.0,
            'default': 40.0
        }


# Singleton instance
_risk_scoring_instance = None

def get_kyb_risk_scoring_service() -> KYBRiskScoringService:
    """Get KYB risk scoring service instance"""
    global _risk_scoring_instance
    
    if _risk_scoring_instance is None:
        _risk_scoring_instance = KYBRiskScoringService()
    
    return _risk_scoring_instance
