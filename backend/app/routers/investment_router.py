"""API Router for Investment Service - Proxies to Go investments-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/investment", tags=["investment"])

GO_SERVICE_URL = os.getenv("INVESTMENTS_GO_URL", "http://localhost:8082")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go investments service"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{GO_SERVICE_URL}/api{path}"
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, json=data, headers=headers)
        elif method == "PUT":
            response = await client.put(url, json=data, headers=headers)
        elif method == "DELETE":
            response = await client.delete(url, headers=headers)
        else:
            raise HTTPException(status_code=405, detail="Method not allowed")
        
        return response.json()

@router.get("/exchanges")
async def get_exchanges():
    """Get available stock exchanges (African focus)"""
    return await proxy_request("GET", "/exchanges")

@router.get("/exchanges/{exchange_code}/stocks")
async def get_stocks(exchange_code: str):
    """Get stocks for an exchange"""
    return await proxy_request("GET", f"/exchanges/{exchange_code}/stocks")

@router.get("/stocks/{symbol}")
async def get_stock(symbol: str):
    """Get stock details"""
    return await proxy_request("GET", f"/stocks/{symbol}")

@router.post("/stocks/buy")
async def buy_stock(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Buy stocks"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/stocks/buy", data, token)

@router.post("/stocks/sell")
async def sell_stock(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Sell stocks"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/stocks/sell", data, token)

@router.get("/portfolio")
async def get_portfolio(authorization: Optional[str] = Header(None)):
    """Get user's portfolio"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/portfolio", token=token)

@router.get("/etfs")
async def get_etfs():
    """Get available ETFs"""
    return await proxy_request("GET", "/etfs")

@router.post("/etfs/buy")
async def buy_etf(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Buy ETF"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/etfs/buy", data, token)

@router.get("/commodities")
async def get_commodities():
    """Get available commodities"""
    return await proxy_request("GET", "/commodities")

@router.post("/commodities/buy")
async def buy_commodity(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Buy commodity"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/commodities/buy", data, token)

@router.get("/watchlist")
async def get_watchlist(authorization: Optional[str] = Header(None)):
    """Get user's watchlist"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/watchlist", token=token)

@router.post("/watchlist")
async def add_to_watchlist(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Add to watchlist"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/watchlist", data, token)


# ---------------------------------------------------------------------------
# PWA contract: plural alias + crypto/explore endpoints
# ---------------------------------------------------------------------------

alias_router = APIRouter(prefix="/investments", tags=["investment"])


@alias_router.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def investments_alias(full_path: str, request_body: Optional[Dict] = None,
                            authorization: Optional[str] = Header(None)):
    """Plural alias for all /investment/* routes (PWA uses plural)."""
    token = authorization.replace("Bearer ", "") if authorization else None
    method = "GET" if request_body is None else "POST"
    return await proxy_request(method, f"/{full_path}", request_body, token)


@router.get("/crypto")
async def list_crypto(authorization: Optional[str] = Header(None)):
    """Crypto pairs — proxied to commodities-trading service when available."""
    token = authorization.replace("Bearer ", "") if authorization else None
    try:
        return await proxy_request("GET", "/market/summary", None, token)
    except Exception:
        raise HTTPException(status_code=503, detail="Crypto market data unavailable")


@router.post("/crypto/buy")
async def buy_crypto(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    payload = {"symbol": data.get("symbol"), "quantity": data.get("quantity"),
               "side": "buy", "order_type": data.get("order_type", "market")}
    return await proxy_request("POST", "/orders", payload, token)


@router.post("/crypto/sell")
async def sell_crypto(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    payload = {"symbol": data.get("symbol"), "quantity": data.get("quantity"),
               "side": "sell", "order_type": data.get("order_type", "market")}
    return await proxy_request("POST", "/orders", payload, token)


@router.get("/market-trends")
async def market_trends(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/market/summary", None, token)


@router.get("/explore")
async def explore_assets(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    try:
        stocks = await proxy_request("GET", "/stocks", None, token)
    except Exception:
        stocks = {"stocks": []}
    try:
        etfs = await proxy_request("GET", "/etfs", None, token)
    except Exception:
        etfs = {"etfs": []}
    return {"stocks": stocks, "etfs": etfs}


@router.get("/asset/{asset_id}")
async def get_asset(asset_id: str, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/stocks/{asset_id}", None, token)
