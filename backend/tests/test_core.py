from datetime import date

from app.models import AssetType, Holding, Lot
from app.services.tax_harvest import build_report, classify_term
from app.services.xirr import xirr


def test_xirr_simple_doubling():
    # 100 -> 200 in exactly 1 year ≈ 100%
    flows = [(date(2024, 1, 1), -100.0), (date(2025, 1, 1), 200.0)]
    r = xirr(flows)
    assert abs(r - 1.0) < 0.01


def test_xirr_sip_like():
    flows = [(date(2024, m, 1), -10_000.0) for m in range(1, 13)]
    flows.append((date(2025, 1, 1), 130_000.0))
    r = xirr(flows)
    assert 0.10 < r < 0.20  # ~15-16% for this pattern


def test_xirr_negative_return():
    flows = [(date(2023, 1, 1), -100.0), (date(2025, 1, 1), 64.0)]
    r = xirr(flows)
    assert -0.25 < r < -0.15  # -20%/yr compounds 100 -> 64 over 2 years


def test_term_classification():
    today = date(2026, 7, 17)
    assert classify_term(date(2025, 6, 1), today) == "LTCG"
    assert classify_term(date(2025, 12, 1), today) == "STCG"


def test_harvest_report_gain_within_exemption():
    h = Holding(
        isin="INF123X01010", name="Test Flexi Cap", asset_type=AssetType.MUTUAL_FUND,
        quantity=1000, last_price=150.0,
        lots=[Lot(source="manual", buy_date=date(2024, 1, 1), quantity=1000, price=100.0)],
    )
    rep = build_report([h], today=date(2026, 7, 17), ltcg_realized=0)
    assert rep.unrealized_ltcg == 50_000.0
    gains = [s for s in rep.suggestions if s.kind == "gain_harvest"]
    assert gains and abs(gains[0].estimated_gain - 50_000.0) < 1
    assert rep.ltcg_exemption_remaining == 125_000.0


def test_harvest_partial_lot_when_gain_exceeds_exemption():
    h = Holding(
        isin="INE009A01021", name="Infosys", asset_type=AssetType.STOCK,
        quantity=1000, last_price=2000.0,
        lots=[Lot(source="manual", buy_date=date(2023, 1, 1), quantity=1000, price=1000.0)],
    )
    rep = build_report([h], today=date(2026, 7, 17), ltcg_realized=0)
    gains = [s for s in rep.suggestions if s.kind == "gain_harvest"]
    assert gains
    # Full ₹10L gain shown — user sees the complete picture
    assert gains[0].estimated_gain == 1_000_000.0
    # Gain exceeds ₹1.25L so within_exemption = False
    assert gains[0].within_exemption is False
    # All units shown in breakdown
    assert gains[0].quantity == 1000


def test_loss_harvest_suggested_only_when_offsettable():
    loser = Holding(
        isin="INE000LOSS01", name="Loser Ltd", asset_type=AssetType.STOCK,
        quantity=100, last_price=50.0,
        lots=[Lot(source="manual", buy_date=date(2026, 1, 1), quantity=100, price=100.0)],  # -5000 ST
    )
    # Loss harvest now always shown regardless of gains (carry-forward)
    rep = build_report([loser], today=date(2026, 7, 17))
    assert [s for s in rep.suggestions if s.kind == "loss_harvest"]

    winner = Holding(
        isin="INE000WINN01", name="Winner Ltd", asset_type=AssetType.STOCK,
        quantity=100, last_price=300.0,
        lots=[Lot(source="manual", buy_date=date(2026, 2, 1), quantity=100, price=100.0)],  # +20000 ST
    )
    rep2 = build_report([loser, winner], today=date(2026, 7, 17))
    assert [s for s in rep2.suggestions if s.kind == "loss_harvest"]


def test_loss_harvest_shown_without_gains():
    """Loss harvest should appear even with no gains — carry-forward is valid."""
    loser = Holding(
        isin="INE000LOSS01", name="Loser Ltd", asset_type=AssetType.STOCK,
        quantity=100, last_price=50.0,
        lots=[Lot(source="manual", buy_date=date(2026, 1, 1), quantity=100, price=100.0)],
    )
    rep = build_report([loser], today=date(2026, 7, 17))
    assert [s for s in rep.suggestions if s.kind == "loss_harvest"], \
        "Loss harvest should appear even without gains to offset (8-year carry-forward)"
