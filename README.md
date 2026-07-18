# Folio — CAS Portfolio Analyzer

Folio reads your NSDL/CDSL Consolidated Account Statement (the PDF your
depository emails you every month) and turns it into a real portfolio view:
live current value, returns (XIRR) per holding and overall, and Indian
tax-harvesting suggestions — all without sending your data anywhere.

## What it does

- **See what you actually own** — every stock and mutual fund holding from
  your CAS, in one table, with live prices.
- **Know your real returns** — XIRR per holding and for your whole portfolio,
  not just "gain since I bought it."
- **Get tax-harvesting suggestions** — which lots to sell to use up your
  ₹1.25L long-term capital gains exemption, and which losses can offset
  gains, before the financial year ends.
- **Filter and drill in** — by stock, by fund, by account.

## Getting Folio

Download the build for your OS from the
[Releases page](../../releases) (or the latest
[Actions run](../../actions) artifacts):

- **macOS** — `.dmg` (Apple Silicon only, for now)
- **Windows** — `.msi` or the `.exe` installer
- **Linux** — `.deb` or `.AppImage`

Folio is a desktop app: it opens like any other application on your
computer, with no browser tab, no sign-in, and no account to create.

> First launch takes a few seconds longer than usual while it starts its
> local backend — that's normal.

## Using it

1. **Upload your CAS PDF.** Get it from the
   [CDSL](https://www.cdslindia.com/) or [NSDL](https://www.nsdl.co.in/)
   website (or CAMS/KFintech, if you hold mutual funds directly). The
   password is your PAN in capital letters.
2. **(Recommended) Import a tradebook CSV.** A CAS only tells you *what* you
   own, not *when you bought it* — so returns and tax-lot calculations need
   your actual buy history. Export your trades from Zerodha/Groww/your
   broker (or your mutual fund transaction statement) as a CSV with columns
   `isin,date,side,quantity,price[,folio]`, and import it. Until you do
   this, Folio falls back to an approximate cost basis and says so on
   screen.
3. **Browse your portfolio.** Check current value, XIRR, and allocation; use
   the tax-harvesting tab before filing.

## Privacy

Nothing about your portfolio ever leaves your computer except two things it
has to fetch to be useful: fund NAVs from AMFI and stock prices from Yahoo
Finance — neither request carries any of your personal data.

- Your CAS PDF is parsed locally and never uploaded to a server.
- Your holdings and trades are stored only in the app itself, on your
  machine.
- There's no account, no login, and no analytics.
- "Clear data" removes everything Folio has stored, permanently.

## A note on tax-harvesting suggestions

Folio models the FY 2025-26 Indian equity tax rules (Sec 112A long-term
gains, Sec 111A short-term gains) as accurately as it can, but it doesn't
account for everything — pre-2018 grandfathering, debt/gold fund taxation,
and intraday/speculative income aren't modelled. **This is not tax advice**;
verify anything material with a tax professional before acting on it.

## Building from source / contributing

See [DEVELOPMENT.md](DEVELOPMENT.md).
