# SRAM Vccmin Calculator

**An interactive, client-side tool for estimating the minimum operating voltage (Vccmin) of large SRAM cache arrays at target production yields.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Overview

The SRAM Vccmin Calculator predicts the minimum supply voltage required for an SRAM array to meet a specified manufacturing yield target. It models bit-cell failure distributions for three mechanisms — **Read (SNM)**, **Write (WM)**, and **Retention (DRV)** — and computes the statistical tail bounds that govern array-level reliability.

For the full mathematical derivation, see [**Mathematical Reference**](MATHEMATICAL_REFERENCE.md).

## Quick Start

This is a static web application with no build step or server dependencies.

```bash
# Clone and open
git clone https://github.com/aposheker/Vccmin_calclator.git
cd Vccmin_calclator

# Open in any browser
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

All computation runs client-side in the browser. No data leaves the machine.

## Architecture

The calculator implements the following pipeline:

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────┐     ┌───────────────┐
│ Input Params │ ──▶ │ Yield → P_fail    │ ──▶ │ Inverse CDF      │ ──▶ │ Per-Mechanism │
│ (N, Y, μ, σ) │     │ P_fail = -ln(Y)/N │     │ (Moro's Approx.) │     │ Vccmin Bounds │
└──────────────┘     └───────────────────┘     └──────────────────┘     └───────┬───────┘
                                                                                │
                                                              max() + EB Noise  │
                                                                                ▼
                                                                     ┌──────────────────┐
                                                                     │ Cache Vccmin      │
                                                                     └──────────────────┘
```

**Key computation steps:**

1. **Failure probability mapping** — Converts array-level yield to per-cell fail probability using the binomial model with a logarithmic identity for numerical stability at large *N*.
2. **Z-score inversion** — Maps the extreme tail probability to a standard-deviation multiplier via Moro's rational approximation (see [app.js:6–32](app.js#L6-L32) for coefficients).
3. **Mechanism bounds** — Computes Vccmin for each failure mechanism as μ + Z·σ.
4. **Array Vccmin** — Takes the maximum across mechanisms and adds the EB noise guard-band.

> **Note on the max() operator.** The `max(Read, Write, Retention)` composition assumes statistically independent failure mechanisms. This is a standard first-order approximation valid when mechanisms are dominated by uncorrelated local random variation (e.g., RDF). The assumption weakens when mechanisms share correlated transistor paths, or under systematic process shifts that affect multiple mechanisms simultaneously. For correlated-mechanism analysis, joint-distribution or copula-based models are required.

## Features

| Feature | Description |
|---|---|
| **Real-time computation** | All outputs update on every keystroke — no submit button |
| **Gaussian PDF visualization** | Overlaid probability density plots for Read, Write, and Retention distributions with a dynamic Vccmin limit line |
| **DPM aging projection** | Logarithmic-scale defect-per-million forecast over product lifetime at constant supply voltage |
| **Temperature derating** | Applies mechanism-specific thermal coefficients to shift cell means |
| **Lifetime aging** | Models NBTI/HCI-driven read margin degradation over time |
| **EB noise guard-band** | Configurable additive margin for supply noise and IR drop |
| **Yield ↔ DPM sync** | Bidirectional conversion between yield percentage and DPM inputs |

## Verification

| Check | Method | Result |
|---|---|---|
| Analytical accuracy | Moro Z-scores validated against Python `statistics.NormalDist.inv_cdf` | Matches to 5 decimal places at P_fail ≈ 9.3×10⁻¹⁴ (128 MB, 99.999% yield) |
| Numerical stability | Logarithmic identity (-ln(Y)/N) vs. direct `Math.pow` | Avoids float underflow for N > 10⁹ |
| Input sanitization | Boundary tests at Y = 100%, size ≤ 0, extreme temperatures | Graceful clamping, no NaN or rendering errors |
| Gumbel convergence | Cross-validated binomial model against Gumbel EVT closed-form | Identical Vccmin to float precision for N > 10⁷ |

## Project Structure

```
├── index.html               # Calculator UI
├── models.html              # In-browser mathematical models page (MathJax)
├── app.js                   # Computation engine and chart rendering
├── style.css                # Styling (dark glassmorphism theme)
├── MATHEMATICAL_REFERENCE.md # Formal derivations and references
├── LICENSE                  # MIT License
└── README.md                # This file
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Disclaimer

This is a personal, open-source project for educational and informational purposes. All models are based on publicly available academic literature. This tool does not represent the views or proprietary methods of any employer or organization.
