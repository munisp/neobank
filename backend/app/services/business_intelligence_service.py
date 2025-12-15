"""
Business Intelligence Service
Advanced analytics, predictive insights, and customer behavior analysis
Implements ML-powered insights for business decision-making
Value: $45M/year as identified in assessment
"""

import asyncio
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import structlog
from sqlalchemy import text, func
from sqlalchemy.ext.asyncio import AsyncSession
import numpy as np
import pandas as pd
from collections import defaultdict

logger = structlog.get_logger()


class CustomerSegmentationEngine:
    """
    Customer segmentation using RFM (Recency, Frequency, Monetary) analysis
    Identifies high-value customers and churn risks
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def segment_customers(self) -> Dict[str, Any]:
        """
        Segment customers based on RFM analysis
        
        Returns:
            Customer segments with characteristics
        """
        try:
            # Get RFM data
            query = text("""
                WITH customer_rfm AS (
                    SELECT 
                        u.id as user_id,
                        u.full_name,
                        u.email,
                        u.created_at as registration_date,
                        COALESCE(MAX(th.created_at), u.created_at) as last_transaction_date,
                        COUNT(th.id) as transaction_count,
                        COALESCE(SUM(ABS(th.amount)), 0) as total_transaction_value,
                        COALESCE(ab.balance, 0) as current_balance,
                        DATE_PART('day', NOW() - COALESCE(MAX(th.created_at), u.created_at)) as recency_days
                    FROM users u
                    LEFT JOIN transaction_history_projection th ON u.id = th.account_id
                    LEFT JOIN account_balance_projection ab ON u.id = ab.account_id
                    WHERE u.kyc_status = 'completed'
                    GROUP BY u.id, u.full_name, u.email, u.created_at, ab.balance
                )
                SELECT 
                    user_id,
                    full_name,
                    email,
                    registration_date,
                    last_transaction_date,
                    transaction_count,
                    total_transaction_value,
                    current_balance,
                    recency_days,
                    NTILE(5) OVER (ORDER BY recency_days ASC) as recency_score,
                    NTILE(5) OVER (ORDER BY transaction_count DESC) as frequency_score,
                    NTILE(5) OVER (ORDER BY total_transaction_value DESC) as monetary_score
                FROM customer_rfm
            """)
            
            result = await self.db.execute(query)
            rows = result.fetchall()
            
            # Convert to DataFrame for analysis
            df = pd.DataFrame([
                {
                    'user_id': row.user_id,
                    'full_name': row.full_name,
                    'email': row.email,
                    'registration_date': row.registration_date,
                    'last_transaction_date': row.last_transaction_date,
                    'transaction_count': row.transaction_count,
                    'total_transaction_value': float(row.total_transaction_value),
                    'current_balance': float(row.current_balance),
                    'recency_days': row.recency_days,
                    'recency_score': row.recency_score,
                    'frequency_score': row.frequency_score,
                    'monetary_score': row.monetary_score
                }
                for row in rows
            ])
            
            if df.empty:
                return {"segments": [], "total_customers": 0}
            
            # Calculate RFM score
            df['rfm_score'] = df['recency_score'] + df['frequency_score'] + df['monetary_score']
            
            # Define segments
            segments = {
                'champions': df[df['rfm_score'] >= 13],  # High R, F, M
                'loyal_customers': df[(df['rfm_score'] >= 10) & (df['rfm_score'] < 13)],
                'potential_loyalists': df[(df['rfm_score'] >= 7) & (df['rfm_score'] < 10) & (df['frequency_score'] >= 3)],
                'at_risk': df[(df['recency_score'] <= 2) & (df['frequency_score'] >= 3)],
                'hibernating': df[(df['recency_score'] <= 2) & (df['frequency_score'] < 3)],
                'new_customers': df[(df['recency_days'] <= 30) & (df['transaction_count'] <= 5)]
            }
            
            # Calculate segment statistics
            segment_stats = []
            for segment_name, segment_df in segments.items():
                if not segment_df.empty:
                    stats = {
                        'segment': segment_name,
                        'customer_count': len(segment_df),
                        'avg_balance': float(segment_df['current_balance'].mean()),
                        'avg_transaction_value': float(segment_df['total_transaction_value'].mean()),
                        'avg_transaction_count': float(segment_df['transaction_count'].mean()),
                        'total_value': float(segment_df['current_balance'].sum()),
                        'percentage': (len(segment_df) / len(df)) * 100
                    }
                    segment_stats.append(stats)
            
            logger.info("Customer segmentation completed",
                       total_customers=len(df),
                       segments=len(segment_stats))
            
            return {
                'segments': segment_stats,
                'total_customers': len(df),
                'analysis_date': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error("Customer segmentation failed", error=str(e))
            return {"segments": [], "total_customers": 0, "error": str(e)}


class ChurnPredictionEngine:
    """
    Churn prediction using behavior patterns
    Identifies customers at risk of leaving
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def predict_churn(self) -> Dict[str, Any]:
        """
        Predict customer churn risk
        
        Returns:
            Churn predictions with risk scores
        """
        try:
            query = text("""
                WITH customer_activity AS (
                    SELECT 
                        u.id as user_id,
                        u.full_name,
                        u.email,
                        DATE_PART('day', NOW() - u.created_at) as account_age_days,
                        DATE_PART('day', NOW() - COALESCE(MAX(th.created_at), u.created_at)) as days_since_last_transaction,
                        COUNT(th.id) as total_transactions,
                        COUNT(th.id) FILTER (WHERE th.created_at > NOW() - INTERVAL '30 days') as transactions_30d,
                        COUNT(th.id) FILTER (WHERE th.created_at > NOW() - INTERVAL '7 days') as transactions_7d,
                        COALESCE(ab.balance, 0) as current_balance,
                        COALESCE(ab.available_balance, 0) as available_balance
                    FROM users u
                    LEFT JOIN transaction_history_projection th ON u.id = th.account_id
                    LEFT JOIN account_balance_projection ab ON u.id = ab.account_id
                    WHERE u.kyc_status = 'completed'
                    AND u.created_at < NOW() - INTERVAL '30 days'  -- At least 30 days old
                    GROUP BY u.id, u.full_name, u.email, u.created_at, ab.balance, ab.available_balance
                )
                SELECT *
                FROM customer_activity
                WHERE total_transactions > 0  -- Has made at least one transaction
            """)
            
            result = await self.db.execute(query)
            rows = result.fetchall()
            
            churn_predictions = []
            
            for row in rows:
                # Calculate churn risk score (0-100)
                risk_score = 0
                risk_factors = []
                
                # Factor 1: Inactivity (40 points max)
                if row.days_since_last_transaction > 90:
                    risk_score += 40
                    risk_factors.append("Inactive for 90+ days")
                elif row.days_since_last_transaction > 60:
                    risk_score += 30
                    risk_factors.append("Inactive for 60+ days")
                elif row.days_since_last_transaction > 30:
                    risk_score += 20
                    risk_factors.append("Inactive for 30+ days")
                
                # Factor 2: Declining activity (30 points max)
                if row.transactions_7d == 0 and row.transactions_30d <= 2:
                    risk_score += 30
                    risk_factors.append("Very low recent activity")
                elif row.transactions_30d <= 5:
                    risk_score += 15
                    risk_factors.append("Low recent activity")
                
                # Factor 3: Low balance (20 points max)
                if float(row.current_balance) < 100:
                    risk_score += 20
                    risk_factors.append("Low account balance")
                elif float(row.current_balance) < 500:
                    risk_score += 10
                    risk_factors.append("Below average balance")
                
                # Factor 4: Account age vs activity (10 points max)
                if row.account_age_days > 180 and row.total_transactions < 10:
                    risk_score += 10
                    risk_factors.append("Old account with low lifetime activity")
                
                # Determine risk level
                if risk_score >= 70:
                    risk_level = "critical"
                elif risk_score >= 50:
                    risk_level = "high"
                elif risk_score >= 30:
                    risk_level = "medium"
                else:
                    risk_level = "low"
                
                # Only include medium+ risk customers
                if risk_score >= 30:
                    churn_predictions.append({
                        'user_id': row.user_id,
                        'full_name': row.full_name,
                        'email': row.email,
                        'churn_risk_score': risk_score,
                        'risk_level': risk_level,
                        'risk_factors': risk_factors,
                        'days_since_last_transaction': row.days_since_last_transaction,
                        'transactions_30d': row.transactions_30d,
                        'current_balance': float(row.current_balance),
                        'recommended_actions': self._get_retention_actions(risk_level, risk_factors)
                    })
            
            # Sort by risk score
            churn_predictions.sort(key=lambda x: x['churn_risk_score'], reverse=True)
            
            # Calculate statistics
            total_at_risk = len(churn_predictions)
            critical_risk = len([p for p in churn_predictions if p['risk_level'] == 'critical'])
            high_risk = len([p for p in churn_predictions if p['risk_level'] == 'high'])
            medium_risk = len([p for p in churn_predictions if p['risk_level'] == 'medium'])
            
            logger.info("Churn prediction completed",
                       total_at_risk=total_at_risk,
                       critical=critical_risk,
                       high=high_risk,
                       medium=medium_risk)
            
            return {
                'predictions': churn_predictions[:100],  # Top 100
                'statistics': {
                    'total_at_risk': total_at_risk,
                    'critical_risk': critical_risk,
                    'high_risk': high_risk,
                    'medium_risk': medium_risk
                },
                'analysis_date': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error("Churn prediction failed", error=str(e))
            return {"predictions": [], "statistics": {}, "error": str(e)}
    
    def _get_retention_actions(self, risk_level: str, risk_factors: List[str]) -> List[str]:
        """Get recommended retention actions"""
        actions = []
        
        if risk_level in ['critical', 'high']:
            actions.append("Immediate personal outreach by account manager")
            actions.append("Offer personalized incentive (cashback, fee waiver)")
        
        if "Inactive" in str(risk_factors):
            actions.append("Send re-engagement email campaign")
            actions.append("Offer limited-time promotion")
        
        if "Low" in str(risk_factors):
            actions.append("Provide financial education content")
            actions.append("Suggest savings goals and features")
        
        if not actions:
            actions.append("Monitor activity and send periodic updates")
        
        return actions


class RevenueAnalyticsEngine:
    """
    Revenue analytics and forecasting
    Identifies revenue opportunities and trends
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def analyze_revenue(self) -> Dict[str, Any]:
        """
        Analyze revenue metrics and trends
        
        Returns:
            Revenue analytics and forecasts
        """
        try:
            # Get revenue data
            query = text("""
                WITH monthly_revenue AS (
                    SELECT 
                        DATE_TRUNC('month', created_at) as month,
                        COUNT(DISTINCT account_id) as active_customers,
                        COUNT(*) as transaction_count,
                        SUM(ABS(amount)) as transaction_volume,
                        SUM(ABS(amount)) * 0.001 as estimated_revenue  -- 0.1% transaction fee
                    FROM transaction_history_projection
                    WHERE created_at >= NOW() - INTERVAL '12 months'
                    GROUP BY DATE_TRUNC('month', created_at)
                    ORDER BY month DESC
                )
                SELECT * FROM monthly_revenue
            """)
            
            result = await self.db.execute(query)
            rows = result.fetchall()
            
            monthly_data = []
            for row in rows:
                monthly_data.append({
                    'month': row.month.isoformat(),
                    'active_customers': row.active_customers,
                    'transaction_count': row.transaction_count,
                    'transaction_volume': float(row.transaction_volume),
                    'estimated_revenue': float(row.estimated_revenue)
                })
            
            if not monthly_data:
                return {"monthly_data": [], "trends": {}, "forecast": {}}
            
            # Calculate trends
            recent_3_months = monthly_data[:3]
            previous_3_months = monthly_data[3:6] if len(monthly_data) >= 6 else monthly_data[3:]
            
            if recent_3_months and previous_3_months:
                recent_avg_revenue = np.mean([m['estimated_revenue'] for m in recent_3_months])
                previous_avg_revenue = np.mean([m['estimated_revenue'] for m in previous_3_months])
                
                revenue_growth = ((recent_avg_revenue - previous_avg_revenue) / previous_avg_revenue * 100) if previous_avg_revenue > 0 else 0
            else:
                revenue_growth = 0
            
            # Simple forecast (linear projection)
            if len(monthly_data) >= 3:
                revenues = [m['estimated_revenue'] for m in monthly_data[:6]]
                avg_growth_rate = np.mean(np.diff(revenues)) / np.mean(revenues) if revenues else 0
                
                current_revenue = monthly_data[0]['estimated_revenue']
                forecast_3_months = current_revenue * (1 + avg_growth_rate * 3)
                forecast_6_months = current_revenue * (1 + avg_growth_rate * 6)
                forecast_12_months = current_revenue * (1 + avg_growth_rate * 12)
            else:
                forecast_3_months = forecast_6_months = forecast_12_months = 0
            
            logger.info("Revenue analysis completed",
                       revenue_growth=revenue_growth,
                       forecast_12m=forecast_12_months)
            
            return {
                'monthly_data': monthly_data,
                'trends': {
                    'revenue_growth_rate': round(revenue_growth, 2),
                    'avg_monthly_revenue': round(np.mean([m['estimated_revenue'] for m in monthly_data]), 2),
                    'avg_transaction_volume': round(np.mean([m['transaction_volume'] for m in monthly_data]), 2)
                },
                'forecast': {
                    '3_months': round(forecast_3_months, 2),
                    '6_months': round(forecast_6_months, 2),
                    '12_months': round(forecast_12_months, 2)
                },
                'analysis_date': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error("Revenue analysis failed", error=str(e))
            return {"monthly_data": [], "trends": {}, "forecast": {}, "error": str(e)}


class FraudPatternDetectionEngine:
    """
    Fraud pattern detection using anomaly detection
    Identifies suspicious transaction patterns
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def detect_fraud_patterns(self) -> Dict[str, Any]:
        """
        Detect fraud patterns in transactions
        
        Returns:
            Fraud pattern analysis
        """
        try:
            query = text("""
                WITH account_patterns AS (
                    SELECT 
                        account_id,
                        COUNT(*) as transaction_count,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as transactions_24h,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as transactions_1h,
                        SUM(ABS(amount)) as total_volume,
                        SUM(ABS(amount)) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as volume_24h,
                        AVG(ABS(amount)) as avg_transaction_amount,
                        MAX(ABS(amount)) as max_transaction_amount,
                        STDDEV(ABS(amount)) as stddev_amount,
                        COUNT(DISTINCT counterparty_account_id) as unique_counterparties,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed_transactions
                    FROM transaction_history_projection
                    WHERE created_at >= NOW() - INTERVAL '30 days'
                    GROUP BY account_id
                )
                SELECT *
                FROM account_patterns
                WHERE transaction_count > 0
            """)
            
            result = await self.db.execute(query)
            rows = result.fetchall()
            
            fraud_alerts = []
            
            for row in rows:
                risk_score = 0
                risk_indicators = []
                
                # Pattern 1: Unusual transaction frequency
                if row.transactions_1h >= 10:
                    risk_score += 40
                    risk_indicators.append(f"High frequency: {row.transactions_1h} transactions in 1 hour")
                elif row.transactions_24h >= 50:
                    risk_score += 30
                    risk_indicators.append(f"High frequency: {row.transactions_24h} transactions in 24 hours")
                
                # Pattern 2: Unusual transaction amounts
                if row.stddev_amount and row.avg_transaction_amount:
                    if float(row.max_transaction_amount) > float(row.avg_transaction_amount) + 3 * float(row.stddev_amount):
                        risk_score += 25
                        risk_indicators.append("Anomalous transaction amount detected")
                
                # Pattern 3: High failure rate
                failure_rate = row.failed_transactions / row.transaction_count if row.transaction_count > 0 else 0
                if failure_rate > 0.3:
                    risk_score += 20
                    risk_indicators.append(f"High failure rate: {failure_rate*100:.1f}%")
                
                # Pattern 4: Rapid fund movement
                if row.volume_24h and row.total_volume:
                    if float(row.volume_24h) > float(row.total_volume) * 0.5:
                        risk_score += 15
                        risk_indicators.append("Rapid fund movement in 24 hours")
                
                # Only include medium+ risk
                if risk_score >= 30:
                    fraud_alerts.append({
                        'account_id': row.account_id,
                        'risk_score': risk_score,
                        'risk_level': 'critical' if risk_score >= 70 else 'high' if risk_score >= 50 else 'medium',
                        'risk_indicators': risk_indicators,
                        'transaction_count_24h': row.transactions_24h,
                        'volume_24h': float(row.volume_24h) if row.volume_24h else 0,
                        'recommended_actions': self._get_fraud_actions(risk_score)
                    })
            
            # Sort by risk score
            fraud_alerts.sort(key=lambda x: x['risk_score'], reverse=True)
            
            logger.info("Fraud pattern detection completed",
                       alerts=len(fraud_alerts))
            
            return {
                'alerts': fraud_alerts[:50],  # Top 50
                'total_alerts': len(fraud_alerts),
                'analysis_date': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error("Fraud pattern detection failed", error=str(e))
            return {"alerts": [], "total_alerts": 0, "error": str(e)}
    
    def _get_fraud_actions(self, risk_score: int) -> List[str]:
        """Get recommended fraud prevention actions"""
        if risk_score >= 70:
            return [
                "Immediately freeze account",
                "Contact customer for verification",
                "Review all recent transactions",
                "Escalate to fraud investigation team"
            ]
        elif risk_score >= 50:
            return [
                "Flag account for review",
                "Require additional verification for large transactions",
                "Monitor closely for 48 hours"
            ]
        else:
            return [
                "Add to watchlist",
                "Monitor for continued suspicious activity"
            ]


class BusinessIntelligenceService:
    """
    Comprehensive Business Intelligence Service
    Combines all analytics engines
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.segmentation_engine = CustomerSegmentationEngine(db_session)
        self.churn_engine = ChurnPredictionEngine(db_session)
        self.revenue_engine = RevenueAnalyticsEngine(db_session)
        self.fraud_engine = FraudPatternDetectionEngine(db_session)
    
    async def generate_comprehensive_report(self) -> Dict[str, Any]:
        """
        Generate comprehensive BI report
        
        Returns:
            Complete business intelligence report
        """
        try:
            # Run all analyses in parallel
            segmentation_task = self.segmentation_engine.segment_customers()
            churn_task = self.churn_engine.predict_churn()
            revenue_task = self.revenue_engine.analyze_revenue()
            fraud_task = self.fraud_engine.detect_fraud_patterns()
            
            segmentation, churn, revenue, fraud = await asyncio.gather(
                segmentation_task,
                churn_task,
                revenue_task,
                fraud_task
            )
            
            # Calculate business impact
            total_customers = segmentation.get('total_customers', 0)
            at_risk_customers = churn.get('statistics', {}).get('total_at_risk', 0)
            churn_rate = (at_risk_customers / total_customers * 100) if total_customers > 0 else 0
            
            # Estimated value at risk (customers * avg balance)
            avg_balance = np.mean([s['avg_balance'] for s in segmentation.get('segments', [])]) if segmentation.get('segments') else 0
            value_at_risk = at_risk_customers * avg_balance
            
            report = {
                'customer_segmentation': segmentation,
                'churn_prediction': churn,
                'revenue_analytics': revenue,
                'fraud_detection': fraud,
                'executive_summary': {
                    'total_customers': total_customers,
                    'churn_rate': round(churn_rate, 2),
                    'value_at_risk': round(value_at_risk, 2),
                    'fraud_alerts': fraud.get('total_alerts', 0),
                    'revenue_growth_rate': revenue.get('trends', {}).get('revenue_growth_rate', 0),
                    'forecast_12m_revenue': revenue.get('forecast', {}).get('12_months', 0)
                },
                'generated_at': datetime.now(timezone.utc).isoformat()
            }
            
            logger.info("Comprehensive BI report generated",
                       total_customers=total_customers,
                       churn_rate=churn_rate,
                       fraud_alerts=fraud.get('total_alerts', 0))
            
            return report
            
        except Exception as e:
            logger.error("BI report generation failed", error=str(e))
            return {"error": str(e)}
    
    async def get_customer_360_view(self, user_id: str) -> Dict[str, Any]:
        """
        Get 360-degree view of a customer
        
        Args:
            user_id: User identifier
            
        Returns:
            Complete customer profile with insights
        """
        try:
            query = text("""
                SELECT 
                    u.id,
                    u.full_name,
                    u.email,
                    u.phone_number,
                    u.created_at as registration_date,
                    u.kyc_status,
                    ab.balance,
                    ab.available_balance,
                    COUNT(th.id) as total_transactions,
                    SUM(ABS(th.amount)) as lifetime_value,
                    MAX(th.created_at) as last_transaction_date
                FROM users u
                LEFT JOIN account_balance_projection ab ON u.id = ab.account_id
                LEFT JOIN transaction_history_projection th ON u.id = th.account_id
                WHERE u.id = :user_id
                GROUP BY u.id, u.full_name, u.email, u.phone_number, u.created_at, u.kyc_status, ab.balance, ab.available_balance
            """)
            
            result = await self.db.execute(query, {"user_id": user_id})
            row = result.fetchone()
            
            if not row:
                return {"error": "Customer not found"}
            
            customer_360 = {
                'profile': {
                    'user_id': row.id,
                    'full_name': row.full_name,
                    'email': row.email,
                    'phone_number': row.phone_number,
                    'registration_date': row.registration_date.isoformat(),
                    'kyc_status': row.kyc_status,
                    'account_age_days': (datetime.now(timezone.utc) - row.registration_date).days
                },
                'financial': {
                    'current_balance': float(row.balance) if row.balance else 0,
                    'available_balance': float(row.available_balance) if row.available_balance else 0,
                    'total_transactions': row.total_transactions,
                    'lifetime_value': float(row.lifetime_value) if row.lifetime_value else 0,
                    'last_transaction_date': row.last_transaction_date.isoformat() if row.last_transaction_date else None
                },
                'generated_at': datetime.now(timezone.utc).isoformat()
            }
            
            return customer_360
            
        except Exception as e:
            logger.error("Customer 360 view failed", error=str(e))
            return {"error": str(e)}
