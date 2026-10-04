"""Segmentation engine + in-app app store.

Segments are market slices (students, SMEs, gig workers, ...). Each
segment owns app tiles that deep-link into product surfaces. Users are
enrolled manually (self-select), by admin, or by rule matching, and the
GET /app-store endpoint returns a personalized catalog: enrolled
segments first ("For you"), everything else under "Discover".

Admin CRUD requires the `admin` or `manager` role.
"""

import uuid
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.platform_integration import get_platform_integration
from app.middleware.auth import get_current_user
from app.services import segment_service
from database.connection import get_db
from database.models import Segment, SegmentApp, SegmentEvent, User, UserSegment

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Segments & App Store"])

ADMIN_ROLES = {"admin", "manager"}


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class SegmentUpsert(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    criteria: Optional[Dict[str, Any]] = None
    is_active: bool = True
    sort_order: int = 0


class SegmentPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    criteria: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class SegmentAppUpsert(BaseModel):
    key: str
    name: str
    tagline: Optional[str] = None
    route: str
    icon: Optional[str] = None
    is_enabled: bool = True
    sort_order: int = 0


class SegmentAppPatch(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    route: Optional[str] = None
    icon: Optional[str] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class EnrollRequest(BaseModel):
    segment_key: str


# --------------------------------------------------------------------------
# Serializers
# --------------------------------------------------------------------------

def _serialize_app(a: SegmentApp) -> Dict[str, Any]:
    return {
        "key": a.key, "name": a.name, "tagline": a.tagline,
        "route": a.route, "icon": a.icon, "is_enabled": a.is_enabled,
        "sort_order": a.sort_order,
    }


def _serialize_segment(s: Segment, apps: Optional[List[SegmentApp]] = None,
                       member_count: int = 0) -> Dict[str, Any]:
    out = {
        "key": s.key, "name": s.name, "description": s.description,
        "icon": s.icon, "criteria": s.criteria or {},
        "is_active": s.is_active, "sort_order": s.sort_order,
        "member_count": member_count,
    }
    if apps is not None:
        out["apps"] = [_serialize_app(a) for a in
                       sorted(apps, key=lambda x: (x.sort_order, x.name))]
    return out


def _require_admin(user: Dict[str, Any]) -> None:
    if not ADMIN_ROLES.intersection(user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin or manager role required")


# --------------------------------------------------------------------------
# Default catalog seed (idempotent — runs only when the table is empty,
# so the store works out of the box and admins can edit afterwards).
# --------------------------------------------------------------------------

DEFAULT_CATALOG: List[Dict[str, Any]] = [
    {
        "key": "students", "name": "Students", "icon": "GraduationCap",
        "description": "University & secondary students — allowance, splits, campus life.",
        "criteria": {"age_range": [15, 30], "kyc_flags": ["student_id"]},
        "sort_order": 10,
        "apps": [
            {"key": "split-bills", "name": "Campus P2P & Splits", "route": "/transfers?mode=split",
             "icon": "Users", "tagline": "Split food, data & hangout bills instantly"},
            {"key": "allowance-autopilot", "name": "Allowance Autopilot", "route": "/savings?preset=allowance",
             "icon": "CalendarClock", "tagline": "Stretch the monthly allowance with auto-budgets"},
            {"key": "data-deals", "name": "Data & Airtime Deals", "route": "/bills?tab=data",
             "icon": "Wifi", "tagline": "Student-priced data bundles"},
            {"key": "savings-challenges", "name": "Savings Challenges", "route": "/savings?tab=challenges",
             "icon": "Trophy", "tagline": "52-week & squad savings challenges"},
            {"key": "learn-earn", "name": "Learn & Earn", "route": "/insights?tab=learn",
             "icon": "BookOpen", "tagline": "Money skills quizzes with rewards"},
            {"key": "fees-escrow", "name": "Fees & Escrow", "route": "/escrow",
             "icon": "ShieldCheck", "tagline": "School fees installments & safe marketplace escrow"},
            {"key": "round-ups", "name": "Round-Up Savings", "route": "/innovations?app=round-ups",
             "icon": "Coins", "tagline": "Every purchase saves your spare change automatically"},
        ],
    },
    {
        "key": "sme-traders", "name": "Traders & SMEs", "icon": "Store",
        "description": "Market traders, shop owners & small businesses.",
        "criteria": {"account_type": ["business"], "kyc_flags": ["cac"]},
        "sort_order": 20,
        "apps": [
            {"key": "pos-collections", "name": "POS & Collections", "route": "/accounts?tab=collections",
             "icon": "CreditCard", "tagline": "Accept transfers & cards, settle same-day"},
            {"key": "invoice-pay", "name": "Invoices", "route": "/bills?tab=invoices",
             "icon": "FileText", "tagline": "Send invoices customers pay in one tap"},
            {"key": "stock-loans", "name": "Stock Financing", "route": "/loans?preset=stock",
             "icon": "Package", "tagline": "Working capital sized to your sales"},
            {"key": "staff-payroll", "name": "Payroll", "route": "/transfers?mode=bulk",
             "icon": "Wallet", "tagline": "Pay staff in bulk, on schedule"},
            {"key": "subscription-radar", "name": "Subscription Radar", "route": "/innovations?app=subscriptions",
             "icon": "Radar", "tagline": "Find recurring charges draining the business account"},
            {"key": "ngx-stocks", "name": "NGX Stocks", "route": "/investments/stocks",
             "icon": "LineChart", "tagline": "Put surplus cash to work on the Nigerian Exchange"},
        ],
    },
    {
        "key": "gig-workers", "name": "Gig & Ride-hail", "icon": "Bike",
        "description": "Drivers, riders & freelancers with variable income.",
        "criteria": {"income_pattern": ["variable"]},
        "sort_order": 30,
        "apps": [
            {"key": "daily-sweep", "name": "Daily Sweep", "route": "/savings?preset=daily-sweep",
             "icon": "Repeat", "tagline": "Auto-save a slice of every day's earnings"},
            {"key": "fuel-float", "name": "Fuel & Maintenance Float", "route": "/loans?preset=fuel",
             "icon": "Fuel", "tagline": "Small floats that repay from earnings"},
            {"key": "tax-estimator", "name": "Tax & Levy Estimator", "route": "/insights?tab=tax",
             "icon": "Calculator", "tagline": "Know what to set aside, weekly"},
        ],
    },
    {
        "key": "nysc", "name": "NYSC Corps Members", "icon": "Medal",
        "description": "Corps members — allawee management & relocation.",
        "criteria": {"age_range": [18, 30], "kyc_flags": ["nysc"]},
        "sort_order": 40,
        "apps": [
            {"key": "allawee-budget", "name": "Allawee Budget", "route": "/budget?preset=nysc",
             "icon": "PieChart", "tagline": "Make ₦77k cover camp to POP"},
            {"key": "relocation-kit", "name": "Relocation Kit", "route": "/transfers?mode=home",
             "icon": "MapPin", "tagline": "Send money home & save for after-service"},
        ],
    },
    {
        "key": "salary-earners", "name": "Salary Earners", "icon": "Briefcase",
        "description": "9–5 workers paid monthly.",
        "criteria": {"income_pattern": ["monthly"]},
        "sort_order": 50,
        "apps": [
            {"key": "payday-autopilot", "name": "Payday Autopilot", "route": "/savings?preset=payday",
             "icon": "CalendarCheck", "tagline": "Save & pay bills the moment salary lands"},
            {"key": "salary-advance", "name": "Salary Advance", "route": "/loans?preset=advance",
             "icon": "HandCoins", "tagline": "Up to 50% before payday"},
            {"key": "invest-starter", "name": "Starter Investments", "route": "/investments",
             "icon": "TrendingUp", "tagline": "T-bills & money market from ₦5,000"},
            {"key": "ngx-stocks", "name": "NGX Stocks", "route": "/investments/stocks",
             "icon": "LineChart", "tagline": "Buy Dangote, MTN, GTCO & more on the Nigerian Exchange"},
            {"key": "mortgage", "name": "Home Mortgage", "route": "/mortgages",
             "icon": "Home", "tagline": "Own your home with a structured payment plan"},
            {"key": "salary-sorter", "name": "Salary Sorter", "route": "/innovations?app=salary-sorter",
             "icon": "SplitSquareHorizontal", "tagline": "Auto-split every salary: save, bills, spend"},
            {"key": "money-copilot", "name": "Money Copilot", "route": "/innovations?app=copilot",
             "icon": "Sparkles", "tagline": "Insights about your money, found automatically"},
        ],
    },
    {
        "key": "ajo-groups", "name": "Ajo & Cooperatives", "icon": "HandHeart",
        "description": "Rotating savings groups, esusu & cooperatives.",
        "criteria": {},
        "sort_order": 60,
        "apps": [
            {"key": "digital-ajo", "name": "Digital Ajo", "route": "/savings?tab=ajo",
             "icon": "UsersRound", "tagline": "Run rotating contributions with payout order & reminders"},
            {"key": "group-escrow", "name": "Group Escrow", "route": "/escrow?mode=group",
             "icon": "Lock", "tagline": "Hold group funds safely until payout day"},
        ],
    },
    {
        "key": "diaspora-remitters", "name": "Diaspora & Remitters", "icon": "Globe",
        "description": "Nigerians abroad sending money home, and their recipients.",
        "criteria": {"countries": ["GB", "US", "CA", "AE", "DE"]},
        "sort_order": 70,
        "apps": [
            {"key": "remit-home", "name": "Send Money Home", "route": "/transfers?mode=international",
             "icon": "SendHorizontal", "tagline": "Low-fee transfers to any Nigerian bank, delivered in minutes"},
            {"key": "fx-rates", "name": "FX Rates & Alerts", "route": "/transfers?mode=international",
             "icon": "LineChart", "tagline": "Live naira rates with target-rate alerts"},
            {"key": "family-wallet", "name": "Family Wallet", "route": "/accounts?tab=family",
             "icon": "Home", "tagline": "Fund a controlled wallet for family back home"},
            {"key": "stablecoins", "name": "Stablecoins (USDT/USDC)", "route": "/investments/crypto",
             "icon": "DollarSign", "tagline": "Hold dollar value, ramp in and out of naira instantly"},
            {"key": "diaspora-mortgage", "name": "Diaspora Mortgage", "route": "/mortgages?product=diaspora",
             "icon": "Building", "tagline": "Buy property back home on a payment plan"},
        ],
    },
    {
        "key": "farmers-coops", "name": "Farmers & Agri-Coops", "icon": "Sprout",
        "description": "Smallholder farmers and agricultural cooperatives.",
        "criteria": {},
        "sort_order": 80,
        "apps": [
            {"key": "seasonal-savings", "name": "Seasonal Savings", "route": "/savings?preset=seasonal",
             "icon": "CalendarDays", "tagline": "Save through harvest, locked until planting season"},
            {"key": "input-financing", "name": "Input Financing", "route": "/loans?preset=agri-input",
             "icon": "Tractor", "tagline": "Seeds, fertilizer & equipment credit timed to the season"},
            {"key": "harvest-escrow", "name": "Harvest Escrow", "route": "/escrow?mode=harvest",
             "icon": "Warehouse", "tagline": "Buyer funds held safely until produce is delivered"},
        ],
    },
    {
        "key": "parents-guardians", "name": "Parents & Guardians", "icon": "Baby",
        "description": "Parents managing school fees and family money.",
        "criteria": {"age_range": [25, 65]},
        "sort_order": 90,
        "apps": [
            {"key": "school-fees", "name": "School Fees Planner", "route": "/savings?preset=school-fees",
             "icon": "School", "tagline": "Termly targets with escrow payment straight to the school"},
            {"key": "kids-wallet", "name": "Kids Wallet", "route": "/accounts?tab=kids",
             "icon": "PiggyBank", "tagline": "Controlled wallets for children with spend limits"},
            {"key": "family-budget", "name": "Family Budget", "route": "/budget?preset=family",
             "icon": "Wallet", "tagline": "Household budget with shared visibility"},
            {"key": "mortgage", "name": "Family Mortgage", "route": "/mortgages",
             "icon": "Home", "tagline": "A payment plan for the family home"},
        ],
    },
]


async def _sync_catalog(db: AsyncSession) -> None:
    """Idempotent catalog sync: inserts segments/apps from DEFAULT_CATALOG
    that don't exist yet, and backfills missing apps on existing segments.
    Never overwrites admin edits (name/description/is_active/etc.)."""
    for seg_def in DEFAULT_CATALOG:
        seg_data = {k: v for k, v in seg_def.items() if k != "apps"}
        app_defs = seg_def.get("apps", [])

        segment = (await db.execute(
            select(Segment).where(Segment.key == seg_data["key"]))).scalar_one_or_none()
        if segment is None:
            segment = Segment(id=uuid.uuid4(), **seg_data)
            db.add(segment)
            await db.flush()
            logger.info("segments.catalog_added", key=seg_data["key"])

        existing_app_keys = set((await db.execute(
            select(SegmentApp.key).where(SegmentApp.segment_id == segment.id))).scalars().all())
        for app_def in app_defs:
            if app_def["key"] not in existing_app_keys:
                db.add(SegmentApp(id=uuid.uuid4(), segment_id=segment.id, **app_def))
    await db.commit()


async def _member_counts(db: AsyncSession) -> Dict[uuid.UUID, int]:
    rows = (await db.execute(
        select(UserSegment.segment_id, func.count())
        .group_by(UserSegment.segment_id))).all()
    return {seg_id: n for seg_id, n in rows}


# --------------------------------------------------------------------------
# Public endpoints
# --------------------------------------------------------------------------

@router.get("/segments")
async def list_segments(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """List active segments with their enabled apps (catalog view)."""
    result = await db.execute(select(Segment).order_by(Segment.sort_order, Segment.name))
    segments = result.scalars().all()
    if not segments:
        await _sync_catalog(db)
        result = await db.execute(select(Segment).order_by(Segment.sort_order, Segment.name))
        segments = result.scalars().all()

    counts = await _member_counts(db)
    out = []
    for s in segments:
        apps = (await db.execute(
            select(SegmentApp).where(SegmentApp.segment_id == s.id)
        )).scalars().all()
        if not s.is_active:
            continue
        out.append(_serialize_segment(s, [a for a in apps if a.is_enabled],
                                      counts.get(s.id, 0)))
    return {"segments": out}


@router.get("/segments/{key}")
async def get_segment(key: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    s = (await db.execute(select(Segment).where(Segment.key == key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    apps = (await db.execute(
        select(SegmentApp).where(SegmentApp.segment_id == s.id)
    )).scalars().all()
    counts = await _member_counts(db)
    return {"segment": _serialize_segment(s, apps, counts.get(s.id, 0))}


@router.get("/app-store")
async def app_store(user: Dict[str, Any] = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Personalized store: enrolled segments first, then discovery."""
    uid = uuid.UUID(user["user_id"]) if not isinstance(user["user_id"], uuid.UUID) \
        else user["user_id"]

    # Lazy rule evaluation: enroll into any active segments whose criteria
    # now match (KYC level, age, country changes all take effect here).
    user_row = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if user_row is not None:
        await segment_service.evaluate_and_enroll(db, user_row)

    catalog = await list_segments(db)
    mine_rows = (await db.execute(
        select(UserSegment.segment_id).where(UserSegment.user_id == uid))).scalars().all()
    mine_ids = set(mine_rows)

    for_you, discover = [], []
    for seg in catalog["segments"]:
        seg_id = (await db.execute(
            select(Segment.id).where(Segment.key == seg["key"]))).scalar_one()
        seg["enrolled"] = seg_id in mine_ids
        (for_you if seg["enrolled"] else discover).append(seg)

    return {"for_you": for_you, "discover": discover}


@router.post("/app-store/enroll")
async def enroll(body: EnrollRequest,
                 user: Dict[str, Any] = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(user["user_id"]) if not isinstance(user["user_id"], uuid.UUID) \
        else user["user_id"]
    s = (await db.execute(
        select(Segment).where(Segment.key == body.segment_key, Segment.is_active.is_(True))
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found or inactive")

    existing = (await db.execute(
        select(UserSegment).where(UserSegment.user_id == uid,
                                  UserSegment.segment_id == s.id))).scalar_one_or_none()
    if existing:
        return {"enrolled": True, "segment": s.key, "already": True}

    db.add(UserSegment(id=uuid.uuid4(), user_id=uid, segment_id=s.id, source="manual"))
    await db.commit()
    logger.info("segments.enrolled", user=str(uid), segment=s.key)
    integ = get_platform_integration()
    await integ.emit("SegmentEnrolled", aggregate_id=str(s.id),
                     aggregate_type="segment",
                     payload={"segment": s.key, "source": "manual"},
                     user_id=str(uid))
    return {"enrolled": True, "segment": s.key, "already": False}


@router.delete("/app-store/enroll/{segment_key}")
async def unenroll(segment_key: str,
                   user: Dict[str, Any] = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(user["user_id"]) if not isinstance(user["user_id"], uuid.UUID) \
        else user["user_id"]
    s = (await db.execute(
        select(Segment).where(Segment.key == segment_key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    row = (await db.execute(
        select(UserSegment).where(UserSegment.user_id == uid,
                                  UserSegment.segment_id == s.id))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"enrolled": False, "segment": s.key}


# --------------------------------------------------------------------------
# Admin CRUD
# --------------------------------------------------------------------------

@router.post("/admin/segments", status_code=201)
async def create_segment(body: SegmentUpsert,
                         user: Dict[str, Any] = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    existing = (await db.execute(
        select(Segment).where(Segment.key == body.key))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Segment key already exists")
    s = Segment(id=uuid.uuid4(), **body.model_dump())
    db.add(s)
    await db.commit()
    logger.info("segments.created", key=s.key, by=user.get("email"))
    return {"segment": _serialize_segment(s)}


@router.patch("/admin/segments/{key}")
async def update_segment(key: str, body: SegmentPatch,
                         user: Dict[str, Any] = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    s = (await db.execute(select(Segment).where(Segment.key == key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    await db.commit()
    return {"segment": _serialize_segment(s)}


@router.post("/admin/segments/{key}/apps", status_code=201)
async def create_segment_app(key: str, body: SegmentAppUpsert,
                             user: Dict[str, Any] = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    s = (await db.execute(select(Segment).where(Segment.key == key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    existing = (await db.execute(
        select(SegmentApp).where(SegmentApp.segment_id == s.id,
                                 SegmentApp.key == body.key))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="App key already exists in this segment")
    a = SegmentApp(id=uuid.uuid4(), segment_id=s.id, **body.model_dump())
    db.add(a)
    await db.commit()
    return {"app": _serialize_app(a)}


@router.patch("/admin/segments/{key}/apps/{app_key}")
async def update_segment_app(key: str, app_key: str, body: SegmentAppPatch,
                             user: Dict[str, Any] = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    s = (await db.execute(select(Segment).where(Segment.key == key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    a = (await db.execute(
        select(SegmentApp).where(SegmentApp.segment_id == s.id,
                                 SegmentApp.key == app_key))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="App not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(a, field, value)
    await db.commit()
    return {"app": _serialize_app(a)}


# --------------------------------------------------------------------------
# Rule evaluation (explicit trigger — also runs lazily on GET /app-store)
# --------------------------------------------------------------------------

@router.post("/app-store/evaluate")
async def evaluate(user: Dict[str, Any] = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Re-run criteria matching for the current user (e.g. after KYC
    completion) and return the segments they now belong to."""
    uid = uuid.UUID(user["user_id"]) if not isinstance(user["user_id"], uuid.UUID) \
        else user["user_id"]
    user_row = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")
    keys = await segment_service.evaluate_and_enroll(db, user_row)
    return {"segments": keys, "features": segment_service.user_features(user_row)}


# --------------------------------------------------------------------------
# Admin activation toggles (turn a whole segment or a single app on/off)
# --------------------------------------------------------------------------

@router.post("/admin/segments/{key}/toggle")
async def toggle_segment(key: str,
                         user: Dict[str, Any] = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Flip a segment active/inactive. Inactive segments disappear from the
    catalog and app store; existing memberships are preserved."""
    _require_admin(user)
    s = (await db.execute(select(Segment).where(Segment.key == key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    s.is_active = not s.is_active
    await db.commit()
    logger.info("segments.toggled", key=s.key, active=s.is_active, by=user.get("email"))
    return {"segment": s.key, "is_active": s.is_active}


@router.post("/admin/segments/{key}/apps/{app_key}/toggle")
async def toggle_segment_app(key: str, app_key: str,
                             user: Dict[str, Any] = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Flip a single app tile enabled/disabled within its segment."""
    _require_admin(user)
    s = (await db.execute(select(Segment).where(Segment.key == key))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")
    a = (await db.execute(
        select(SegmentApp).where(SegmentApp.segment_id == s.id,
                                 SegmentApp.key == app_key))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="App not found")
    a.is_enabled = not a.is_enabled
    await db.commit()
    logger.info("segments.app_toggled", segment=s.key, app=a.key,
                enabled=a.is_enabled, by=user.get("email"))
    return {"segment": s.key, "app": a.key, "is_enabled": a.is_enabled}


# --------------------------------------------------------------------------
# Feature-gate dependency for other routers
# --------------------------------------------------------------------------

async def require_segment_app(app_key: str,
                              user: Dict[str, Any] = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """FastAPI dependency: gate any endpoint behind a segment app tile.

    Usage in another router:
        @router.get("/ajo/groups")
        async def ajo_groups(ctx = Depends(require_segment_app_factory("digital-ajo"))):
            ...

    Returns 403 when the app tile is disabled or its segment is inactive,
    and 404 when the user is not enrolled in the owning segment. On success
    returns {"segment_key": ..., "app_key": ...} context.
    """
    a = (await db.execute(
        select(SegmentApp).where(SegmentApp.key == app_key))).scalar_one_or_none()
    if not a or not a.is_enabled:
        raise HTTPException(status_code=403, detail="This app is currently unavailable")
    s = (await db.execute(
        select(Segment).where(Segment.id == a.segment_id))).scalar_one_or_none()
    if not s or not s.is_active:
        raise HTTPException(status_code=403, detail="This app is currently unavailable")

    uid = uuid.UUID(user["user_id"]) if not isinstance(user["user_id"], uuid.UUID) \
        else user["user_id"]
    member = (await db.execute(
        select(UserSegment).where(UserSegment.user_id == uid,
                                  UserSegment.segment_id == s.id))).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Join this segment to use this app")
    return {"segment_key": s.key, "app_key": a.key}


def require_segment_app_factory(app_key: str):
    """Bind require_segment_app to a specific tile key for Depends()."""
    async def _dep(user: Dict[str, Any] = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
        return await require_segment_app(app_key, user, db)
    return _dep


@router.get("/admin/segments")
async def admin_list_segments(user: Dict[str, Any] = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Admin catalog: ALL segments (including inactive) with ALL apps
    (including disabled), so deactivated items can be re-enabled."""
    _require_admin(user)
    await _sync_catalog(db)
    segments = (await db.execute(
        select(Segment).order_by(Segment.sort_order, Segment.name))).scalars().all()
    counts = await _member_counts(db)
    out = []
    for s in segments:
        apps = (await db.execute(
            select(SegmentApp).where(SegmentApp.segment_id == s.id))).scalars().all()
        out.append(_serialize_segment(s, apps, counts.get(s.id, 0)))
    return {"segments": out}


# --------------------------------------------------------------------------
# Analytics (closes the "app-store analytics" gap)
# --------------------------------------------------------------------------

class TrackEvent(BaseModel):
    segment_key: str
    app_key: Optional[str] = None
    event: str  # view | enroll | launch


@router.post("/app-store/track", status_code=201)
async def track_event(body: TrackEvent,
                      user: Dict[str, Any] = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if body.event not in ("view", "enroll", "launch"):
        raise HTTPException(status_code=422, detail="event must be view|enroll|launch")
    evt = SegmentEvent(id=uuid.uuid4(), user_id=uuid.UUID(str(user["user_id"])),
                       segment_key=body.segment_key, app_key=body.app_key,
                       event=body.event)
    db.add(evt)
    await db.commit()

    # Search index (OpenSearch) + lakehouse sink for segment analytics
    from app.infrastructure.middleware_adapters import get_opensearch
    await get_opensearch().index_transaction_event(
        f"segment_{body.event}", str(evt.id),
        {"segment_key": body.segment_key, "app_key": body.app_key,
         "user_id": str(user["user_id"])})
    try:
        from app.services.lakehouse_service import get_lakehouse_service
        lake = get_lakehouse_service()
        if lake is not None:
            await lake.ingest_segment_event({
                "id": str(evt.id), "user_id": str(user["user_id"]),
                "segment_key": body.segment_key, "app_key": body.app_key,
                "event": body.event,
            })
    except Exception as exc:  # noqa: BLE001
        logger.warning("lakehouse.ingest_failed", error=str(exc))
    return {"tracked": True}


@router.get("/admin/segments-analytics")
async def segments_analytics(user: Dict[str, Any] = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    rows = (await db.execute(
        select(SegmentEvent.segment_key, SegmentEvent.event, func.count())
        .group_by(SegmentEvent.segment_key, SegmentEvent.event))).all()
    out: Dict[str, Any] = {}
    for seg_key, event, n in rows:
        out.setdefault(seg_key, {"views": 0, "enrolls": 0, "launches": 0})
        out[seg_key][event + "s"] = n
    return {"analytics": out}


# --------------------------------------------------------------------------
# Middleware observability — which platform components are live right now
# --------------------------------------------------------------------------

@router.get("/admin/middleware/status")
async def middleware_status(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Live status of every middleware component the platform integrates
    with. Admin/manager only."""
    _require_admin(user)
    from app.infrastructure.middleware_adapters import (
        get_dapr, get_geo, get_keycloak, get_opensearch, get_temporal,
    )
    from app.infrastructure.fluvio_client import get_fluvio_producer
    from app.services.platform_integration import get_platform_integration
    from config.settings import settings

    integ = get_platform_integration()
    bus_backend = "unknown"
    try:
        from app.services.event_bus_service import get_event_bus
        bus_backend = get_event_bus().backend
    except Exception:
        pass

    temporal = get_temporal()
    return {"middleware": {
        "tigerbeetle": {"configured": True, "available": integ.ledger_available},
        "kafka": {"configured": bool(settings.KAFKA_BROKERS),
                  "active_backend": bus_backend},
        "fluvio": {"configured": bool(settings.FLUVIO_ENDPOINT),
                   "available": get_fluvio_producer().available},
        "temporal": {"configured": bool(settings.TEMPORAL_HOST)},
        "dapr": {"sidecar_port": settings.DAPR_HTTP_PORT,
                 "pubsub": settings.DAPR_PUBSUB_NAME},
        "keycloak": {"configured": get_keycloak().enabled,
                     "issuer": get_keycloak().issuer if get_keycloak().enabled else None},
        "permify": {"service": "permify_service"},
        "opensearch": {"configured": get_opensearch().enabled},
        "geolibre": {"configured": get_geo().enabled},
        "sedona": {"enabled": settings.SEDONA_ENABLED},
        "mojaloop": {"ledgers": ["MOJALOOP_SETTLEMENT", "MOJALOOP_POSITION"]},
        "apisix": {"configured": bool(settings.APISIX_ADMIN_URL)},
        "openappsec": {"layer": "gateway (apisix plugin)"},
        "postgres": {"configured": True},
        "redis": {"configured": True},
        "lakehouse": {"service": "lakehouse_service"},
    }}
