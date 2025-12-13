"""
Lakehouse Router - Full API for Apache Iceberg Data Lake

Provides endpoints for:
- Table management and initialization
- Data ingestion for all platform features
- Analytics and aggregation queries
- Time-travel queries (historical data)
- Comprehensive dashboard data
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import structlog

from app.services.lakehouse_service import get_lakehouse_service

logger = structlog.get_logger()

router = APIRouter(prefix="/lakehouse", tags=["Lakehouse Analytics"])


class IngestRequest(BaseModel):
    data: Dict[str, Any]


class QueryRequest(BaseModel):
    table_name: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = 1000
    snapshot_id: Optional[int] = None


class AggregateRequest(BaseModel):
    table_name: str
    metric_field: str
    aggregation: str = "sum"
    group_by: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.get("/health")
async def lakehouse_health():
    """Health check for Lakehouse service"""
    service = get_lakehouse_service()
    return {
        "status": "healthy",
        "catalog_uri": service.catalog_uri,
        "warehouse": service.warehouse,
        "namespace": service.namespace,
        "catalog_connected": service.catalog is not None
    }


@router.post("/initialize")
async def initialize_tables():
    """Initialize all Lakehouse tables"""
    service = get_lakehouse_service()
    results = await service.initialize_all_tables()
    return {
        "success": True,
        "tables_created": results,
        "total_tables": len(results)
    }


@router.get("/tables")
async def list_tables():
    """List all available Lakehouse tables"""
    return {
        "tables": [
            {"name": "transactions_fact", "description": "All financial transactions", "partitioned_by": "day"},
            {"name": "accounts_dimension", "description": "Account information", "partitioned_by": None},
            {"name": "fraud_events", "description": "Fraud detection events", "partitioned_by": "day"},
            {"name": "investments_fact", "description": "Stock/ETF/commodity trades", "partitioned_by": "day"},
            {"name": "loans_fact", "description": "Loan applications and disbursements", "partitioned_by": None},
            {"name": "kyc_events", "description": "KYC/KYB verification events", "partitioned_by": "day"},
            {"name": "insurance_policies", "description": "Insurance policies", "partitioned_by": None},
            {"name": "savings_vaults", "description": "Savings goals and vaults", "partitioned_by": None},
            {"name": "bill_payments", "description": "Bill payment transactions", "partitioned_by": "day"},
            {"name": "bnpl_orders", "description": "Buy Now Pay Later orders", "partitioned_by": None},
            {"name": "rewards_events", "description": "Points and cashback events", "partitioned_by": "day"},
            {"name": "telecom_purchases", "description": "Airtime and data purchases", "partitioned_by": "day"}
        ]
    }


@router.post("/query")
async def query_data(request: QueryRequest):
    """Query data from a Lakehouse table with optional time-travel"""
    service = get_lakehouse_service()
    
    data = await service.query_data(
        table_name=request.table_name,
        filters=request.filters,
        limit=request.limit,
        snapshot_id=request.snapshot_id
    )
    
    return {
        "table": request.table_name,
        "rows": len(data),
        "data": data,
        "snapshot_id": request.snapshot_id
    }


@router.get("/tables/{table_name}/snapshots")
async def get_table_snapshots(table_name: str):
    """Get all snapshots for time-travel queries"""
    service = get_lakehouse_service()
    snapshots = await service.get_table_snapshots(table_name)
    
    return {
        "table": table_name,
        "snapshots": snapshots,
        "count": len(snapshots)
    }


@router.post("/aggregate")
async def aggregate_data(request: AggregateRequest):
    """Run aggregation queries on Lakehouse data"""
    service = get_lakehouse_service()
    
    start_date = datetime.fromisoformat(request.start_date) if request.start_date else None
    end_date = datetime.fromisoformat(request.end_date) if request.end_date else None
    
    results = await service.aggregate_metrics(
        table_name=request.table_name,
        metric_field=request.metric_field,
        aggregation=request.aggregation,
        group_by=request.group_by,
        start_date=start_date,
        end_date=end_date
    )
    
    return {
        "table": request.table_name,
        "aggregation": request.aggregation,
        "metric_field": request.metric_field,
        "results": results
    }


@router.post("/ingest/transaction")
async def ingest_transaction(request: IngestRequest):
    """Ingest transaction data"""
    service = get_lakehouse_service()
    success = await service.ingest_transaction_data([request.data])
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest transaction")
    
    return {"success": True, "table": "transactions_fact"}


@router.post("/ingest/fraud")
async def ingest_fraud_event(request: IngestRequest):
    """Ingest fraud detection event"""
    service = get_lakehouse_service()
    success = await service.ingest_fraud_event(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest fraud event")
    
    return {"success": True, "table": "fraud_events"}


@router.post("/ingest/investment")
async def ingest_investment(request: IngestRequest):
    """Ingest investment trade"""
    service = get_lakehouse_service()
    success = await service.ingest_investment_trade(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest investment")
    
    return {"success": True, "table": "investments_fact"}


@router.post("/ingest/loan")
async def ingest_loan(request: IngestRequest):
    """Ingest loan data"""
    service = get_lakehouse_service()
    success = await service.ingest_loan(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest loan")
    
    return {"success": True, "table": "loans_fact"}


@router.post("/ingest/kyc")
async def ingest_kyc(request: IngestRequest):
    """Ingest KYC/KYB event"""
    service = get_lakehouse_service()
    success = await service.ingest_kyc_event(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest KYC event")
    
    return {"success": True, "table": "kyc_events"}


@router.post("/ingest/insurance")
async def ingest_insurance(request: IngestRequest):
    """Ingest insurance policy"""
    service = get_lakehouse_service()
    success = await service.ingest_insurance_policy(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest insurance policy")
    
    return {"success": True, "table": "insurance_policies"}


@router.post("/ingest/savings")
async def ingest_savings(request: IngestRequest):
    """Ingest savings vault"""
    service = get_lakehouse_service()
    success = await service.ingest_savings_vault(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest savings vault")
    
    return {"success": True, "table": "savings_vaults"}


@router.post("/ingest/bill")
async def ingest_bill_payment(request: IngestRequest):
    """Ingest bill payment"""
    service = get_lakehouse_service()
    success = await service.ingest_bill_payment(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest bill payment")
    
    return {"success": True, "table": "bill_payments"}


@router.post("/ingest/bnpl")
async def ingest_bnpl(request: IngestRequest):
    """Ingest BNPL order"""
    service = get_lakehouse_service()
    success = await service.ingest_bnpl_order(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest BNPL order")
    
    return {"success": True, "table": "bnpl_orders"}


@router.post("/ingest/reward")
async def ingest_reward(request: IngestRequest):
    """Ingest reward event"""
    service = get_lakehouse_service()
    success = await service.ingest_reward_event(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest reward event")
    
    return {"success": True, "table": "rewards_events"}


@router.post("/ingest/telecom")
async def ingest_telecom(request: IngestRequest):
    """Ingest telecom purchase"""
    service = get_lakehouse_service()
    success = await service.ingest_telecom_purchase(request.data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to ingest telecom purchase")
    
    return {"success": True, "table": "telecom_purchases"}


@router.get("/analytics/dashboard")
async def get_dashboard_analytics(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
):
    """Get analytics dashboard data"""
    service = get_lakehouse_service()
    
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    data = await service.get_analytics_dashboard_data(start_date=start, end_date=end)
    
    return data


@router.get("/analytics/comprehensive")
async def get_comprehensive_analytics(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
):
    """Get comprehensive analytics across all platform features"""
    service = get_lakehouse_service()
    
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    data = await service.get_comprehensive_analytics(start_date=start, end_date=end)
    
    return data


@router.get("/analytics/transactions")
async def get_transaction_analytics(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    group_by: Optional[str] = Query(None, description="Group by field (e.g., transaction_type, currency)")
):
    """Get transaction analytics"""
    service = get_lakehouse_service()
    
    start = datetime.fromisoformat(start_date) if start_date else datetime.utcnow() - timedelta(days=30)
    end = datetime.fromisoformat(end_date) if end_date else datetime.utcnow()
    
    group_by_list = [group_by] if group_by else None
    
    volume = await service.aggregate_metrics(
        "transactions_fact", "amount", "sum",
        group_by=group_by_list, start_date=start, end_date=end
    )
    
    count = await service.aggregate_metrics(
        "transactions_fact", "transaction_id", "count",
        group_by=group_by_list, start_date=start, end_date=end
    )
    
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "volume": volume,
        "count": count,
        "grouped_by": group_by
    }


@router.get("/analytics/investments")
async def get_investment_analytics(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get investment analytics by exchange"""
    service = get_lakehouse_service()
    
    start = datetime.fromisoformat(start_date) if start_date else datetime.utcnow() - timedelta(days=30)
    end = datetime.fromisoformat(end_date) if end_date else datetime.utcnow()
    
    by_exchange = await service.aggregate_metrics(
        "investments_fact", "total_amount", "sum",
        group_by=["exchange"], start_date=start, end_date=end
    )
    
    total_trades = await service.aggregate_metrics(
        "investments_fact", "trade_id", "count",
        start_date=start, end_date=end
    )
    
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "volume_by_exchange": by_exchange,
        "total_trades": total_trades
    }


@router.get("/analytics/loans")
async def get_loan_analytics():
    """Get loan portfolio analytics"""
    service = get_lakehouse_service()
    
    total_disbursed = await service.aggregate_metrics("loans_fact", "principal_amount", "sum")
    outstanding = await service.aggregate_metrics("loans_fact", "outstanding_balance", "sum")
    by_type = await service.aggregate_metrics("loans_fact", "principal_amount", "sum", group_by=["loan_type"])
    by_status = await service.aggregate_metrics("loans_fact", "loan_id", "count", group_by=["status"])
    
    return {
        "total_disbursed": total_disbursed,
        "outstanding_balance": outstanding,
        "by_type": by_type,
        "by_status": by_status
    }


@router.get("/analytics/kyc")
async def get_kyc_analytics():
    """Get KYC/KYB analytics"""
    service = get_lakehouse_service()
    
    by_country = await service.aggregate_metrics("kyc_events", "application_id", "count", group_by=["country"])
    by_status = await service.aggregate_metrics("kyc_events", "application_id", "count", group_by=["verification_status"])
    by_tier = await service.aggregate_metrics("kyc_events", "application_id", "count", group_by=["tier"])
    avg_risk = await service.aggregate_metrics("kyc_events", "risk_score", "avg")
    
    return {
        "by_country": by_country,
        "by_status": by_status,
        "by_tier": by_tier,
        "average_risk_score": avg_risk
    }


@router.get("/analytics/fraud")
async def get_fraud_analytics(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get fraud detection analytics"""
    service = get_lakehouse_service()
    
    start = datetime.fromisoformat(start_date) if start_date else datetime.utcnow() - timedelta(days=30)
    end = datetime.fromisoformat(end_date) if end_date else datetime.utcnow()
    
    by_type = await service.aggregate_metrics(
        "fraud_events", "event_id", "count",
        group_by=["fraud_type"], start_date=start, end_date=end
    )
    
    avg_score = await service.aggregate_metrics(
        "fraud_events", "fraud_score", "avg",
        start_date=start, end_date=end
    )
    
    total_events = await service.aggregate_metrics(
        "fraud_events", "event_id", "count",
        start_date=start, end_date=end
    )
    
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "by_type": by_type,
        "average_fraud_score": avg_score,
        "total_events": total_events
    }
