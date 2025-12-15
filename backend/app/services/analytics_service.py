"""
Advanced Analytics and Business Intelligence Service for NeoBank Platform
Provides comprehensive analytics, reporting, and business intelligence capabilities
"""

import logging
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import pandas as pd
import numpy as np
from sqlalchemy import text, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.models import User, Account, Transaction, KYCDocument
from ..database.connection import get_db_session
from ..config.settings import settings

logger = logging.getLogger(__name__)

@dataclass
class AnalyticsMetrics:
    """Core analytics metrics"""
    total_users: int
    active_users: int
    total_accounts: int
    total_transactions: int
    transaction_volume: float
    average_transaction_amount: float
    fraud_detection_rate: float
    kyc_completion_rate: float
    customer_acquisition_cost: float
    lifetime_value: float

@dataclass
class TransactionAnalytics:
    """Transaction-specific analytics"""
    daily_volume: List[Dict[str, Any]]
    hourly_patterns: List[Dict[str, Any]]
    transaction_types: List[Dict[str, Any]]
    geographic_distribution: List[Dict[str, Any]]
    fraud_patterns: List[Dict[str, Any]]
    velocity_analysis: Dict[str, Any]

@dataclass
class UserBehaviorAnalytics:
    """User behavior analytics"""
    user_segments: List[Dict[str, Any]]
    engagement_metrics: Dict[str, Any]
    churn_analysis: Dict[str, Any]
    feature_usage: List[Dict[str, Any]]
    session_analytics: Dict[str, Any]
    retention_cohorts: List[Dict[str, Any]]

@dataclass
class RiskAnalytics:
    """Risk and compliance analytics"""
    fraud_trends: List[Dict[str, Any]]
    risk_distribution: Dict[str, Any]
    compliance_metrics: Dict[str, Any]
    aml_alerts: List[Dict[str, Any]]
    kyc_analytics: Dict[str, Any]
    credit_risk_distribution: Dict[str, Any]

class AdvancedAnalyticsService:
    """Service for advanced analytics and business intelligence"""
    
    def __init__(self):
        self.cache_ttl = 300  # 5 minutes cache
        self._cache: Dict[str, Tuple[datetime, Any]] = {}
    
    async def get_platform_overview(self, date_range: int = 30) -> AnalyticsMetrics:
        """Get comprehensive platform overview metrics"""
        cache_key = f"platform_overview_{date_range}"
        
        if self._is_cached(cache_key):
            return self._get_cached(cache_key)
        
        try:
            async with get_db_session() as session:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=date_range)
                
                # Total users
                total_users_result = await session.execute(
                    text("SELECT COUNT(*) FROM users WHERE created_at <= :end_date"),
                    {"end_date": end_date}
                )
                total_users = total_users_result.scalar()
                
                # Active users (users with transactions in the period)
                active_users_result = await session.execute(
                    text("""
                        SELECT COUNT(DISTINCT u.id) 
                        FROM users u 
                        JOIN accounts a ON u.id = a.user_id 
                        JOIN transactions t ON (a.id = t.sender_account_id OR a.id = t.recipient_account_id)
                        WHERE t.created_at BETWEEN :start_date AND :end_date
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                active_users = active_users_result.scalar() or 0
                
                # Total accounts
                total_accounts_result = await session.execute(
                    text("SELECT COUNT(*) FROM accounts WHERE created_at <= :end_date"),
                    {"end_date": end_date}
                )
                total_accounts = total_accounts_result.scalar()
                
                # Transaction metrics
                transaction_metrics_result = await session.execute(
                    text("""
                        SELECT 
                            COUNT(*) as total_transactions,
                            COALESCE(SUM(amount), 0) as total_volume,
                            COALESCE(AVG(amount), 0) as avg_amount
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        AND status = 'completed'
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                tx_metrics = transaction_metrics_result.fetchone()
                
                # Fraud detection rate
                fraud_rate_result = await session.execute(
                    text("""
                        SELECT 
                            COUNT(CASE WHEN fraud_score > 0.7 THEN 1 END) * 100.0 / COUNT(*) as fraud_rate
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                fraud_rate = fraud_rate_result.scalar() or 0.0
                
                # KYC completion rate
                kyc_rate_result = await session.execute(
                    text("""
                        SELECT 
                            COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) * 100.0 / COUNT(*) as kyc_rate
                        FROM users 
                        WHERE created_at BETWEEN :start_date AND :end_date
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                kyc_rate = kyc_rate_result.scalar() or 0.0
                
                metrics = AnalyticsMetrics(
                    total_users=total_users,
                    active_users=active_users,
                    total_accounts=total_accounts,
                    total_transactions=tx_metrics.total_transactions,
                    transaction_volume=float(tx_metrics.total_volume),
                    average_transaction_amount=float(tx_metrics.avg_amount),
                    fraud_detection_rate=float(fraud_rate),
                    kyc_completion_rate=float(kyc_rate),
                    customer_acquisition_cost=self._calculate_cac(total_users, date_range),
                    lifetime_value=self._calculate_ltv(float(tx_metrics.total_volume), active_users)
                )
                
                self._cache_result(cache_key, metrics)
                return metrics
                
        except Exception as e:
            logger.error(f"Error getting platform overview: {e}")
            raise
    
    async def get_transaction_analytics(self, date_range: int = 30) -> TransactionAnalytics:
        """Get detailed transaction analytics"""
        cache_key = f"transaction_analytics_{date_range}"
        
        if self._is_cached(cache_key):
            return self._get_cached(cache_key)
        
        try:
            async with get_db_session() as session:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=date_range)
                
                # Daily volume analysis
                daily_volume_result = await session.execute(
                    text("""
                        SELECT 
                            DATE(created_at) as date,
                            COUNT(*) as transaction_count,
                            SUM(amount) as total_volume,
                            AVG(amount) as avg_amount
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        AND status = 'completed'
                        GROUP BY DATE(created_at)
                        ORDER BY date
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                daily_volume = [
                    {
                        "date": row.date.isoformat(),
                        "transaction_count": row.transaction_count,
                        "total_volume": float(row.total_volume),
                        "avg_amount": float(row.avg_amount)
                    }
                    for row in daily_volume_result.fetchall()
                ]
                
                # Hourly patterns
                hourly_patterns_result = await session.execute(
                    text("""
                        SELECT 
                            EXTRACT(HOUR FROM created_at) as hour,
                            COUNT(*) as transaction_count,
                            AVG(amount) as avg_amount
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        AND status = 'completed'
                        GROUP BY EXTRACT(HOUR FROM created_at)
                        ORDER BY hour
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                hourly_patterns = [
                    {
                        "hour": int(row.hour),
                        "transaction_count": row.transaction_count,
                        "avg_amount": float(row.avg_amount)
                    }
                    for row in hourly_patterns_result.fetchall()
                ]
                
                # Transaction types distribution
                transaction_types_result = await session.execute(
                    text("""
                        SELECT 
                            transaction_type,
                            COUNT(*) as count,
                            SUM(amount) as total_volume,
                            AVG(amount) as avg_amount
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        AND status = 'completed'
                        GROUP BY transaction_type
                        ORDER BY count DESC
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                transaction_types = [
                    {
                        "type": row.transaction_type,
                        "count": row.count,
                        "total_volume": float(row.total_volume),
                        "avg_amount": float(row.avg_amount),
                        "percentage": 0.0  # Will be calculated after getting total
                    }
                    for row in transaction_types_result.fetchall()
                ]
                
                # Calculate percentages
                total_transactions = sum(t["count"] for t in transaction_types)
                for t in transaction_types:
                    t["percentage"] = (t["count"] / total_transactions * 100) if total_transactions > 0 else 0
                
                # Fraud patterns analysis
                fraud_patterns_result = await session.execute(
                    text("""
                        SELECT 
                            CASE 
                                WHEN fraud_score < 0.3 THEN 'Low Risk'
                                WHEN fraud_score < 0.7 THEN 'Medium Risk'
                                ELSE 'High Risk'
                            END as risk_category,
                            COUNT(*) as count,
                            AVG(amount) as avg_amount,
                            AVG(fraud_score) as avg_fraud_score
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        GROUP BY 
                            CASE 
                                WHEN fraud_score < 0.3 THEN 'Low Risk'
                                WHEN fraud_score < 0.7 THEN 'Medium Risk'
                                ELSE 'High Risk'
                            END
                        ORDER BY avg_fraud_score
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                fraud_patterns = [
                    {
                        "risk_category": row.risk_category,
                        "count": row.count,
                        "avg_amount": float(row.avg_amount),
                        "avg_fraud_score": float(row.avg_fraud_score)
                    }
                    for row in fraud_patterns_result.fetchall()
                ]
                
                # Velocity analysis
                velocity_analysis = await self._calculate_velocity_analysis(session, start_date, end_date)
                
                analytics = TransactionAnalytics(
                    daily_volume=daily_volume,
                    hourly_patterns=hourly_patterns,
                    transaction_types=transaction_types,
                    geographic_distribution=[],  # Would require location data
                    fraud_patterns=fraud_patterns,
                    velocity_analysis=velocity_analysis
                )
                
                self._cache_result(cache_key, analytics)
                return analytics
                
        except Exception as e:
            logger.error(f"Error getting transaction analytics: {e}")
            raise
    
    async def get_user_behavior_analytics(self, date_range: int = 30) -> UserBehaviorAnalytics:
        """Get user behavior analytics"""
        cache_key = f"user_behavior_{date_range}"
        
        if self._is_cached(cache_key):
            return self._get_cached(cache_key)
        
        try:
            async with get_db_session() as session:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=date_range)
                
                # User segmentation based on transaction behavior
                user_segments_result = await session.execute(
                    text("""
                        WITH user_stats AS (
                            SELECT 
                                u.id,
                                u.created_at as registration_date,
                                COUNT(t.id) as transaction_count,
                                COALESCE(SUM(t.amount), 0) as total_volume,
                                COALESCE(AVG(t.amount), 0) as avg_transaction
                            FROM users u
                            LEFT JOIN accounts a ON u.id = a.user_id
                            LEFT JOIN transactions t ON a.id = t.sender_account_id 
                                AND t.created_at BETWEEN :start_date AND :end_date
                                AND t.status = 'completed'
                            GROUP BY u.id, u.created_at
                        )
                        SELECT 
                            CASE 
                                WHEN transaction_count = 0 THEN 'Inactive'
                                WHEN transaction_count <= 5 THEN 'Low Activity'
                                WHEN transaction_count <= 20 THEN 'Medium Activity'
                                ELSE 'High Activity'
                            END as segment,
                            COUNT(*) as user_count,
                            AVG(total_volume) as avg_volume,
                            AVG(transaction_count) as avg_transactions
                        FROM user_stats
                        GROUP BY 
                            CASE 
                                WHEN transaction_count = 0 THEN 'Inactive'
                                WHEN transaction_count <= 5 THEN 'Low Activity'
                                WHEN transaction_count <= 20 THEN 'Medium Activity'
                                ELSE 'High Activity'
                            END
                        ORDER BY avg_transactions DESC
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                user_segments = [
                    {
                        "segment": row.segment,
                        "user_count": row.user_count,
                        "avg_volume": float(row.avg_volume),
                        "avg_transactions": float(row.avg_transactions)
                    }
                    for row in user_segments_result.fetchall()
                ]
                
                # Engagement metrics
                engagement_result = await session.execute(
                    text("""
                        SELECT 
                            COUNT(DISTINCT u.id) as total_users,
                            COUNT(DISTINCT CASE WHEN t.created_at >= :recent_date THEN u.id END) as active_users_7d,
                            COUNT(DISTINCT CASE WHEN t.created_at >= :month_date THEN u.id END) as active_users_30d,
                            AVG(CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END) as engagement_rate
                        FROM users u
                        LEFT JOIN accounts a ON u.id = a.user_id
                        LEFT JOIN transactions t ON a.id = t.sender_account_id
                    """),
                    {
                        "recent_date": end_date - timedelta(days=7),
                        "month_date": end_date - timedelta(days=30)
                    }
                )
                engagement_data = engagement_result.fetchone()
                
                engagement_metrics = {
                    "total_users": engagement_data.total_users,
                    "active_users_7d": engagement_data.active_users_7d or 0,
                    "active_users_30d": engagement_data.active_users_30d or 0,
                    "engagement_rate": float(engagement_data.engagement_rate or 0),
                    "dau_mau_ratio": (engagement_data.active_users_7d / engagement_data.active_users_30d * 100) 
                                   if engagement_data.active_users_30d else 0
                }
                
                # Churn analysis
                churn_analysis = await self._calculate_churn_analysis(session, start_date, end_date)
                
                # Feature usage (mock data - would require feature tracking)
                feature_usage = [
                    {"feature": "Money Transfer", "usage_count": 1250, "unique_users": 450},
                    {"feature": "Bill Payment", "usage_count": 890, "unique_users": 320},
                    {"feature": "Airtime Purchase", "usage_count": 650, "unique_users": 280},
                    {"feature": "QR Payment", "usage_count": 320, "unique_users": 150},
                    {"feature": "Account Statement", "usage_count": 180, "unique_users": 120}
                ]
                
                # Session analytics (mock data - would require session tracking)
                session_analytics = {
                    "avg_session_duration": 8.5,  # minutes
                    "avg_sessions_per_user": 12.3,
                    "bounce_rate": 15.2,  # percentage
                    "conversion_rate": 3.8  # percentage
                }
                
                # Retention cohorts
                retention_cohorts = await self._calculate_retention_cohorts(session, start_date, end_date)
                
                analytics = UserBehaviorAnalytics(
                    user_segments=user_segments,
                    engagement_metrics=engagement_metrics,
                    churn_analysis=churn_analysis,
                    feature_usage=feature_usage,
                    session_analytics=session_analytics,
                    retention_cohorts=retention_cohorts
                )
                
                self._cache_result(cache_key, analytics)
                return analytics
                
        except Exception as e:
            logger.error(f"Error getting user behavior analytics: {e}")
            raise
    
    async def get_risk_analytics(self, date_range: int = 30) -> RiskAnalytics:
        """Get risk and compliance analytics"""
        cache_key = f"risk_analytics_{date_range}"
        
        if self._is_cached(cache_key):
            return self._get_cached(cache_key)
        
        try:
            async with get_db_session() as session:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=date_range)
                
                # Fraud trends over time
                fraud_trends_result = await session.execute(
                    text("""
                        SELECT 
                            DATE(created_at) as date,
                            COUNT(*) as total_transactions,
                            COUNT(CASE WHEN fraud_score > 0.7 THEN 1 END) as high_risk_transactions,
                            AVG(fraud_score) as avg_fraud_score,
                            MAX(fraud_score) as max_fraud_score
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        GROUP BY DATE(created_at)
                        ORDER BY date
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                fraud_trends = [
                    {
                        "date": row.date.isoformat(),
                        "total_transactions": row.total_transactions,
                        "high_risk_transactions": row.high_risk_transactions,
                        "fraud_rate": (row.high_risk_transactions / row.total_transactions * 100) 
                                    if row.total_transactions > 0 else 0,
                        "avg_fraud_score": float(row.avg_fraud_score),
                        "max_fraud_score": float(row.max_fraud_score)
                    }
                    for row in fraud_trends_result.fetchall()
                ]
                
                # Risk distribution
                risk_distribution_result = await session.execute(
                    text("""
                        SELECT 
                            CASE 
                                WHEN fraud_score < 0.3 THEN 'Low'
                                WHEN fraud_score < 0.7 THEN 'Medium'
                                ELSE 'High'
                            END as risk_level,
                            COUNT(*) as count,
                            AVG(amount) as avg_amount,
                            SUM(amount) as total_amount
                        FROM transactions 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        GROUP BY 
                            CASE 
                                WHEN fraud_score < 0.3 THEN 'Low'
                                WHEN fraud_score < 0.7 THEN 'Medium'
                                ELSE 'High'
                            END
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                risk_dist_data = risk_distribution_result.fetchall()
                total_count = sum(row.count for row in risk_dist_data)
                
                risk_distribution = {
                    row.risk_level.lower(): {
                        "count": row.count,
                        "percentage": (row.count / total_count * 100) if total_count > 0 else 0,
                        "avg_amount": float(row.avg_amount),
                        "total_amount": float(row.total_amount)
                    }
                    for row in risk_dist_data
                }
                
                # Compliance metrics
                compliance_metrics_result = await session.execute(
                    text("""
                        SELECT 
                            COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) as verified_users,
                            COUNT(CASE WHEN kyc_status = 'pending' THEN 1 END) as pending_users,
                            COUNT(CASE WHEN kyc_status = 'rejected' THEN 1 END) as rejected_users,
                            COUNT(*) as total_users
                        FROM users 
                        WHERE created_at BETWEEN :start_date AND :end_date
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                compliance_data = compliance_metrics_result.fetchone()
                
                compliance_metrics = {
                    "kyc_completion_rate": (compliance_data.verified_users / compliance_data.total_users * 100) 
                                         if compliance_data.total_users > 0 else 0,
                    "kyc_rejection_rate": (compliance_data.rejected_users / compliance_data.total_users * 100) 
                                        if compliance_data.total_users > 0 else 0,
                    "pending_verifications": compliance_data.pending_users,
                    "total_verifications": compliance_data.total_users
                }
                
                # AML alerts (mock data - would require AML system integration)
                aml_alerts = [
                    {
                        "alert_id": "AML001",
                        "user_id": "123",
                        "alert_type": "Unusual Transaction Pattern",
                        "risk_score": 0.85,
                        "status": "Under Review",
                        "created_at": "2025-01-07T10:30:00Z"
                    },
                    {
                        "alert_id": "AML002",
                        "user_id": "456",
                        "alert_type": "High Value Transaction",
                        "risk_score": 0.75,
                        "status": "Resolved",
                        "created_at": "2025-01-06T15:45:00Z"
                    }
                ]
                
                # KYC analytics
                kyc_analytics_result = await session.execute(
                    text("""
                        SELECT 
                            document_type,
                            COUNT(*) as total_documents,
                            COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_documents,
                            AVG(confidence_score) as avg_confidence
                        FROM kyc_documents 
                        WHERE created_at BETWEEN :start_date AND :end_date
                        GROUP BY document_type
                    """),
                    {"start_date": start_date, "end_date": end_date}
                )
                kyc_data = kyc_analytics_result.fetchall()
                
                kyc_analytics = {
                    "document_verification_rates": {
                        row.document_type: {
                            "total": row.total_documents,
                            "verified": row.verified_documents,
                            "verification_rate": (row.verified_documents / row.total_documents * 100) 
                                               if row.total_documents > 0 else 0,
                            "avg_confidence": float(row.avg_confidence or 0)
                        }
                        for row in kyc_data
                    }
                }
                
                # Credit risk distribution (mock data - would require credit scoring integration)
                credit_risk_distribution = {
                    "excellent": {"count": 150, "percentage": 25.0, "avg_score": 780},
                    "good": {"count": 200, "percentage": 33.3, "avg_score": 720},
                    "fair": {"count": 180, "percentage": 30.0, "avg_score": 650},
                    "poor": {"count": 70, "percentage": 11.7, "avg_score": 580}
                }
                
                analytics = RiskAnalytics(
                    fraud_trends=fraud_trends,
                    risk_distribution=risk_distribution,
                    compliance_metrics=compliance_metrics,
                    aml_alerts=aml_alerts,
                    kyc_analytics=kyc_analytics,
                    credit_risk_distribution=credit_risk_distribution
                )
                
                self._cache_result(cache_key, analytics)
                return analytics
                
        except Exception as e:
            logger.error(f"Error getting risk analytics: {e}")
            raise
    
    async def generate_custom_report(self, report_config: Dict[str, Any]) -> Dict[str, Any]:
        """Generate custom analytics report based on configuration"""
        try:
            report_type = report_config.get("type", "summary")
            date_range = report_config.get("date_range", 30)
            filters = report_config.get("filters", {})
            
            if report_type == "executive_summary":
                return await self._generate_executive_summary(date_range, filters)
            elif report_type == "fraud_analysis":
                return await self._generate_fraud_analysis_report(date_range, filters)
            elif report_type == "user_engagement":
                return await self._generate_user_engagement_report(date_range, filters)
            elif report_type == "financial_performance":
                return await self._generate_financial_performance_report(date_range, filters)
            else:
                return await self._generate_summary_report(date_range, filters)
                
        except Exception as e:
            logger.error(f"Error generating custom report: {e}")
            raise
    
    # Helper methods
    
    def _is_cached(self, key: str) -> bool:
        """Check if result is cached and still valid"""
        if key not in self._cache:
            return False
        
        cached_time, _ = self._cache[key]
        return (datetime.now() - cached_time).seconds < self.cache_ttl
    
    def _get_cached(self, key: str) -> Any:
        """Get cached result"""
        _, result = self._cache[key]
        return result
    
    def _cache_result(self, key: str, result: Any):
        """Cache result with timestamp"""
        self._cache[key] = (datetime.now(), result)
    
    def _calculate_cac(self, total_users: int, date_range: int) -> float:
        """Calculate Customer Acquisition Cost"""
        # Mock calculation - would use actual marketing spend data
        marketing_spend = 50000.0  # Monthly marketing spend
        monthly_users = total_users / (date_range / 30)
        return marketing_spend / monthly_users if monthly_users > 0 else 0.0
    
    def _calculate_ltv(self, total_volume: float, active_users: int) -> float:
        """Calculate Customer Lifetime Value"""
        # Simplified LTV calculation
        if active_users == 0:
            return 0.0
        
        avg_revenue_per_user = total_volume * 0.01  # Assume 1% revenue from transaction volume
        avg_customer_lifespan = 24  # months
        return (avg_revenue_per_user / active_users) * avg_customer_lifespan
    
    async def _calculate_velocity_analysis(self, session: AsyncSession, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Calculate transaction velocity analysis"""
        velocity_result = await session.execute(
            text("""
                WITH user_velocity AS (
                    SELECT 
                        u.id as user_id,
                        COUNT(t.id) as transaction_count,
                        COUNT(t.id) / EXTRACT(DAYS FROM (:end_date - :start_date)) as daily_velocity,
                        AVG(t.amount) as avg_amount
                    FROM users u
                    JOIN accounts a ON u.id = a.user_id
                    JOIN transactions t ON a.id = t.sender_account_id
                    WHERE t.created_at BETWEEN :start_date AND :end_date
                    AND t.status = 'completed'
                    GROUP BY u.id
                )
                SELECT 
                    AVG(daily_velocity) as avg_daily_velocity,
                    MAX(daily_velocity) as max_daily_velocity,
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY daily_velocity) as p95_velocity,
                    COUNT(CASE WHEN daily_velocity > 10 THEN 1 END) as high_velocity_users
                FROM user_velocity
            """),
            {"start_date": start_date, "end_date": end_date}
        )
        velocity_data = velocity_result.fetchone()
        
        return {
            "avg_daily_velocity": float(velocity_data.avg_daily_velocity or 0),
            "max_daily_velocity": float(velocity_data.max_daily_velocity or 0),
            "p95_velocity": float(velocity_data.p95_velocity or 0),
            "high_velocity_users": velocity_data.high_velocity_users or 0
        }
    
    async def _calculate_churn_analysis(self, session: AsyncSession, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Calculate user churn analysis"""
        # Users who were active before the period but not during
        churn_result = await session.execute(
            text("""
                WITH active_before AS (
                    SELECT DISTINCT u.id
                    FROM users u
                    JOIN accounts a ON u.id = a.user_id
                    JOIN transactions t ON a.id = t.sender_account_id
                    WHERE t.created_at < :start_date
                    AND t.created_at >= :start_date - INTERVAL '30 days'
                ),
                active_during AS (
                    SELECT DISTINCT u.id
                    FROM users u
                    JOIN accounts a ON u.id = a.user_id
                    JOIN transactions t ON a.id = t.sender_account_id
                    WHERE t.created_at BETWEEN :start_date AND :end_date
                )
                SELECT 
                    COUNT(ab.id) as users_before,
                    COUNT(ad.id) as users_retained,
                    COUNT(ab.id) - COUNT(ad.id) as churned_users
                FROM active_before ab
                LEFT JOIN active_during ad ON ab.id = ad.id
            """),
            {"start_date": start_date, "end_date": end_date}
        )
        churn_data = churn_result.fetchone()
        
        churn_rate = ((churn_data.churned_users / churn_data.users_before * 100) 
                     if churn_data.users_before > 0 else 0)
        
        return {
            "users_before_period": churn_data.users_before,
            "users_retained": churn_data.users_retained,
            "churned_users": churn_data.churned_users,
            "churn_rate": churn_rate,
            "retention_rate": 100 - churn_rate
        }
    
    async def _calculate_retention_cohorts(self, session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Calculate user retention cohorts"""
        # Simplified cohort analysis - would be more complex in production
        cohorts_result = await session.execute(
            text("""
                WITH user_cohorts AS (
                    SELECT 
                        u.id,
                        DATE_TRUNC('month', u.created_at) as cohort_month,
                        DATE_TRUNC('month', t.created_at) as transaction_month
                    FROM users u
                    JOIN accounts a ON u.id = a.user_id
                    LEFT JOIN transactions t ON a.id = t.sender_account_id
                    WHERE u.created_at >= :start_date - INTERVAL '6 months'
                    AND t.created_at BETWEEN u.created_at AND :end_date
                )
                SELECT 
                    cohort_month,
                    COUNT(DISTINCT id) as cohort_size,
                    COUNT(DISTINCT CASE WHEN transaction_month = cohort_month THEN id END) as month_0,
                    COUNT(DISTINCT CASE WHEN transaction_month = cohort_month + INTERVAL '1 month' THEN id END) as month_1,
                    COUNT(DISTINCT CASE WHEN transaction_month = cohort_month + INTERVAL '2 months' THEN id END) as month_2
                FROM user_cohorts
                GROUP BY cohort_month
                ORDER BY cohort_month
            """),
            {"start_date": start_date, "end_date": end_date}
        )
        
        return [
            {
                "cohort_month": row.cohort_month.isoformat(),
                "cohort_size": row.cohort_size,
                "retention_month_0": 100.0,  # Always 100% in month 0
                "retention_month_1": (row.month_1 / row.cohort_size * 100) if row.cohort_size > 0 else 0,
                "retention_month_2": (row.month_2 / row.cohort_size * 100) if row.cohort_size > 0 else 0
            }
            for row in cohorts_result.fetchall()
        ]
    
    async def _generate_executive_summary(self, date_range: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Generate executive summary report"""
        overview = await self.get_platform_overview(date_range)
        transaction_analytics = await self.get_transaction_analytics(date_range)
        user_analytics = await self.get_user_behavior_analytics(date_range)
        risk_analytics = await self.get_risk_analytics(date_range)
        
        return {
            "report_type": "executive_summary",
            "date_range": date_range,
            "generated_at": datetime.now().isoformat(),
            "key_metrics": asdict(overview),
            "transaction_summary": {
                "daily_avg_volume": sum(d["total_volume"] for d in transaction_analytics.daily_volume) / len(transaction_analytics.daily_volume) if transaction_analytics.daily_volume else 0,
                "peak_hour": max(transaction_analytics.hourly_patterns, key=lambda x: x["transaction_count"])["hour"] if transaction_analytics.hourly_patterns else 0,
                "fraud_rate": overview.fraud_detection_rate
            },
            "user_summary": {
                "engagement_rate": user_analytics.engagement_metrics["engagement_rate"],
                "churn_rate": user_analytics.churn_analysis["churn_rate"],
                "active_user_ratio": user_analytics.engagement_metrics["dau_mau_ratio"]
            },
            "risk_summary": {
                "high_risk_percentage": risk_analytics.risk_distribution.get("high", {}).get("percentage", 0),
                "kyc_completion": risk_analytics.compliance_metrics["kyc_completion_rate"],
                "aml_alerts": len(risk_analytics.aml_alerts)
            }
        }
    
    async def _generate_fraud_analysis_report(self, date_range: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Generate detailed fraud analysis report"""
        risk_analytics = await self.get_risk_analytics(date_range)
        transaction_analytics = await self.get_transaction_analytics(date_range)
        
        return {
            "report_type": "fraud_analysis",
            "date_range": date_range,
            "generated_at": datetime.now().isoformat(),
            "fraud_trends": risk_analytics.fraud_trends,
            "risk_distribution": risk_analytics.risk_distribution,
            "fraud_patterns": transaction_analytics.fraud_patterns,
            "velocity_analysis": transaction_analytics.velocity_analysis,
            "recommendations": [
                "Implement additional verification for transactions > ₦100,000",
                "Monitor users with velocity > 10 transactions/day",
                "Review high-risk transactions within 1 hour",
                "Update fraud detection rules based on recent patterns"
            ]
        }
    
    async def _generate_user_engagement_report(self, date_range: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Generate user engagement report"""
        user_analytics = await self.get_user_behavior_analytics(date_range)
        
        return {
            "report_type": "user_engagement",
            "date_range": date_range,
            "generated_at": datetime.now().isoformat(),
            "user_segments": user_analytics.user_segments,
            "engagement_metrics": user_analytics.engagement_metrics,
            "feature_usage": user_analytics.feature_usage,
            "retention_cohorts": user_analytics.retention_cohorts,
            "churn_analysis": user_analytics.churn_analysis,
            "recommendations": [
                "Focus on converting inactive users to low activity",
                "Implement push notifications for user re-engagement",
                "Develop loyalty program for high-activity users",
                "Improve onboarding flow to reduce early churn"
            ]
        }
    
    async def _generate_financial_performance_report(self, date_range: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Generate financial performance report"""
        overview = await self.get_platform_overview(date_range)
        transaction_analytics = await self.get_transaction_analytics(date_range)
        
        # Calculate revenue metrics (simplified)
        total_volume = overview.transaction_volume
        estimated_revenue = total_volume * 0.01  # 1% fee assumption
        
        return {
            "report_type": "financial_performance",
            "date_range": date_range,
            "generated_at": datetime.now().isoformat(),
            "revenue_metrics": {
                "total_transaction_volume": total_volume,
                "estimated_revenue": estimated_revenue,
                "average_transaction_value": overview.average_transaction_amount,
                "revenue_per_user": estimated_revenue / overview.active_users if overview.active_users > 0 else 0
            },
            "transaction_breakdown": transaction_analytics.transaction_types,
            "daily_performance": transaction_analytics.daily_volume,
            "growth_metrics": {
                "customer_acquisition_cost": overview.customer_acquisition_cost,
                "lifetime_value": overview.lifetime_value,
                "ltv_cac_ratio": overview.lifetime_value / overview.customer_acquisition_cost if overview.customer_acquisition_cost > 0 else 0
            }
        }
    
    async def _generate_summary_report(self, date_range: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Generate summary report"""
        overview = await self.get_platform_overview(date_range)
        
        return {
            "report_type": "summary",
            "date_range": date_range,
            "generated_at": datetime.now().isoformat(),
            "summary_metrics": asdict(overview)
        }

# Global instance
analytics_service = AdvancedAnalyticsService()
