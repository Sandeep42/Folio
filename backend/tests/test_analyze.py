import asyncio
from datetime import date

from app.models import AnalyzeRequest, AssetType, Holding, TradeRow
from app.routers.analyze import _key, analyze, holding_detail


def test_key_strips_only_zero_padding():
    # RTA zero-padding artifacts collapse onto the same key...
    assert _key("ISIN1", "12345678/0") == _key("ISIN1", "12345678")
    assert _key("ISIN1", "12345678/00") == _key("ISIN1", "12345678")
    # ...but a genuinely distinct folio suffix must NOT collide with it.
    assert _key("ISIN1", "12345678/45") != _key("ISIN1", "12345678/00")
    assert _key("ISIN1", "12345678/45") != _key("ISIN1", "12345678")


def test_distinct_folios_of_same_fund_are_not_merged():
    """Two real folios of the same ISIN must stay independent: quantities,
    lots, and cash flows from one folio must never bleed into the other's
    XIRR (regression for the /key folio-suffix collision bug)."""
    holdings = [
        Holding(isin="INF789F01XA0", name="UTI Nifty 50 Index Fund",
                asset_type=AssetType.MUTUAL_FUND, quantity=46.476,
                folio="12345678/00", last_price=168.59),
        Holding(isin="INF789F01XA0", name="UTI Nifty 50 Index Fund",
                asset_type=AssetType.MUTUAL_FUND, quantity=50.0,
                folio="12345678/45", last_price=168.59),
    ]
    trades = [
        TradeRow(isin="INF789F01XA0", txn_date=date(2023, 1, 17), side="BUY",
                  quantity=46.476, price=122.64, folio="12345678/00"),
        TradeRow(isin="INF789F01XA0", txn_date=date(2023, 1, 17), side="BUY",
                  quantity=50.0, price=130.0, folio="12345678/45"),
    ]
    req = AnalyzeRequest(holdings=holdings, trades=trades, fetch_prices=False)
    result = asyncio.run(analyze(req))

    views = result["holdings"]
    assert len(views) == 2, "both folios must survive as independent holdings"

    by_folio = {v["folio"]: v for v in views}
    assert set(by_folio) == {"12345678/00", "12345678/45"}

    # Each folio's invested amount must reflect only its own trade.
    assert abs(by_folio["12345678/00"]["invested"] - 46.476 * 122.64) < 1
    assert abs(by_folio["12345678/45"]["invested"] - 50.0 * 130.0) < 1

    # Neither folio's XIRR should be dragged negative by the other's cash flow.
    assert by_folio["12345678/00"]["xirr"] > 0
    assert by_folio["12345678/45"]["xirr"] > 0


def test_holding_detail_scopes_flows_to_its_own_folio():
    """/api/holding-detail has its own separate cash-flow-scoping logic from
    /api/analyze's _view() — regression to make sure it got the same fix."""
    holdings = [
        Holding(isin="INF789F01XA0", name="UTI Nifty 50 Index Fund",
                asset_type=AssetType.MUTUAL_FUND, quantity=46.476,
                folio="12345678/00", last_price=168.59),
        Holding(isin="INF789F01XA0", name="UTI Nifty 50 Index Fund",
                asset_type=AssetType.MUTUAL_FUND, quantity=50.0,
                folio="12345678/45", last_price=168.59),
    ]
    trades = [
        TradeRow(isin="INF789F01XA0", txn_date=date(2023, 1, 17), side="BUY",
                  quantity=46.476, price=122.64, folio="12345678/00"),
        TradeRow(isin="INF789F01XA0", txn_date=date(2023, 1, 17), side="BUY",
                  quantity=50.0, price=130.0, folio="12345678/45"),
    ]
    req = AnalyzeRequest(holdings=holdings, trades=trades, fetch_prices=False)

    detail = asyncio.run(holding_detail(req, isin="INF789F01XA0", folio="12345678/00"))
    assert len(detail["trades"]) == 1, "must only see its own folio's trade"
    assert abs(detail["invested"] - 46.476 * 122.64) < 1
    assert detail["xirr"] > 0
