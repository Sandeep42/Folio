"""Shared data models.

Design note: an NSDL/CDSL CAS is a *holdings snapshot* plus transactions for the
statement period only. XIRR and lot-level tax math need full acquisition
history, so the store keeps two layers:

  1. holdings  - what the CAS says you own today (source of truth for quantity)
  2. lots      - acquisition lots (date, qty, price). Populated from CAS
                 transaction sections when present, and enriched via broker
                 tradebook / MF transaction CSV imports.
"""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AssetType(str, Enum):
    STOCK = "stock"
    MUTUAL_FUND = "mutual_fund"


class Lot(BaseModel):
    """A single acquisition lot (used for FIFO tax math)."""
    buy_date: date
    quantity: float
    price: float                      # per unit acquisition price
    source: str = "cas"               # cas | tradebook | manual


class Transaction(BaseModel):
    """A cash flow event for XIRR. amount < 0 = money invested, > 0 = money out."""
    txn_date: date
    amount: float
    isin: str
    description: str = ""


class CostBasisType(str, Enum):
    NORMAL   = "normal"       # bought at market — cost is known
    ZERO     = "zero"         # ESOP/RSU vested at ₹0 — cost genuinely zero, included in XIRR
    UNKNOWN  = "unknown"      # gifted / inherited / lost records — excluded from P&L & XIRR


class Holding(BaseModel):
    isin: str
    name: str
    asset_type: AssetType
    quantity: float
    symbol: Optional[str] = None
    folio: Optional[str] = None
    amfi_code: Optional[str] = None
    avg_cost: Optional[float] = None
    last_price: Optional[float] = None
    price_as_of: Optional[date] = None
    lots: list[Lot] = Field(default_factory=list)
    cost_basis_type: CostBasisType = CostBasisType.NORMAL


class HoldingView(BaseModel):
    """Holding enriched with computed fields for the UI."""
    isin: str
    name: str
    asset_type: AssetType
    quantity: float
    symbol: Optional[str] = None
    folio: Optional[str] = None
    avg_cost: Optional[float] = None
    invested: Optional[float] = None
    last_price: Optional[float] = None
    current_value: Optional[float] = None
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    xirr: Optional[float] = None
    price_as_of: Optional[date] = None
    cost_basis_type: CostBasisType = CostBasisType.NORMAL
    xirr_excluded: bool = False        # True when excluded from portfolio XIRR


class HarvestLot(BaseModel):
    isin: str
    name: str
    asset_type: AssetType
    buy_date: date
    quantity: float
    buy_price: float
    last_price: float
    unrealized_gain: float
    term: str                          # "LTCG" | "STCG"
    days_to_ltcg: Optional[int] = None # for STCG lots, days until they turn LT


class SellLot(BaseModel):
    """One lot within a harvest suggestion — exactly what to sell."""
    buy_date: date
    quantity_to_sell: float
    buy_price: float
    last_price: float
    gain: float
    term: str
    days_to_ltcg: Optional[int] = None


class HarvestSuggestion(BaseModel):
    kind: str                          # "gain_harvest" | "loss_harvest"
    isin: str
    name: str
    quantity: float
    estimated_gain: float
    rationale: str
    lot_breakdown: list[SellLot] = Field(default_factory=list)
    within_exemption: bool = True      # False = gain exceeds remaining ₹1.25L window


class TaxHarvestReport(BaseModel):
    fy_label: str
    ltcg_exemption_limit: float
    ltcg_realized_assumed: float       # user-entered gains already booked this FY
    ltcg_exemption_remaining: float
    unrealized_ltcg: float
    unrealized_stcg: float
    unrealized_lt_losses: float
    unrealized_st_losses: float
    lots: list[HarvestLot]
    suggestions: list[HarvestSuggestion]


class PortfolioSummary(BaseModel):
    invested: float
    current_value: float
    pnl: float
    pnl_pct: Optional[float]
    xirr: Optional[float]
    holdings_count: int
    priced_count: int                  # holdings we found a live price for


class TradeRow(BaseModel):
    """One broker/MF trade, as parsed from a tradebook CSV. Stored by the
    browser and replayed into lots on every /api/analyze call."""
    isin: str
    txn_date: date
    side: str                          # BUY | SELL
    quantity: float
    price: float
    folio: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Everything the server needs, supplied by the browser each time."""
    holdings: list[Holding]
    trades: list[TradeRow] = Field(default_factory=list)
    ltcg_realized: float = 0.0
    fetch_prices: bool = True
