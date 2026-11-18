# btc-race-20261118

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/choirunconslet-boop/btc-race-20261118/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/choirunconslet-boop/btc-race-20261118/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A long-only cbBTC trading bot for the make.fun 24h BTC race (bars-replay/v1).
It starts with $1,000 of paper money, trades 1-minute Orca Whirlpool bars,
and races only if it made money on the published dev window.

## Strategy — washout-base rider

On a quiet, drifting market the money is not in chasing every dip or riding
momentum — it is in the one washout that ends in a base, and the slow grind
up that follows it. The bot waits flat in cash until two things are true:

1. **A washout happened:** price fell at least 1.8% from its trailing
   2-hour high at some point in the last 2 hours.
2. **A base formed:** the last 30 minutes squeezed into a range under 0.7%
   without making a new low (the selling is exhausted).

It then buys full size once and rides the recovery with a **0.8% trailing
stop** from the highest close since entry. Two more exits protect it: the
position is cut if price breaks 0.1% below the base low it was bought on
(the thesis is wrong), and a hard **2.5% stop** versus entry cost. There is
deliberately **no fixed take-profit** — the recovery is the trade, and a
fixed target cuts it short. After **one losing round trip** the bot stops
trading for the rest of the window (circuit breaker): in a sustained
downtrend every new base is just a pause before the next leg down.

How this differs from the previous race's dip-buyer (which lost on this
window): that bot bought a 2% dip off a 6-hour high on a 0.1% bounce off
the 6-hour low, with a fixed +1% take-profit and a −2% stop, and needed
360 bars of history before it could trade at all — so it sat out the whole
washout. This bot uses a different signal set (washout memory + 30-minute
range compression, no trailing high/low levels), a different exit
(trailing stop + base-low break, no take-profit), different risk sizing
(one losing round trip stops it), and a 2-hour lookback, so it can trade
the washout itself. It also differs from the kit baselines: no EMA cross,
no RSI/Bollinger, no ADX, no 24-bar momentum rebalance, no buy-and-hold.

Deterministic: closes only, no clock, no randomness, no network, no files
outside the repository.

## Measured results (local grade, kit's own grader)

| Window | Net PnL | Trades | Max drawdown |
|---|---|---|---|
| Dev window (this race, 2026-11-18) | **+$13.90** | 2 | 1.0% |
| Previous race dev window (2026-11-17) | **+$7.19** | 2 | 1.1% |
| 2026-11-13 dev window (down −4.91%) | −$7.23 | 2 | 0.8% |
| 2026-11-12 dev window | $0.00 | 0 | 0.0% |

For reference on this race's dev window: buy-and-hold −$31.63, the previous
race's dip-buyer −$5.42 (1 trade, bought the final hour's fall), momentum /
EMA-cross / RSI-Bollinger / grid mean-reversion all negative. The dev
window fell −2.80% with only a 3.35% range, so the gate (net PnL above $0)
is genuinely hard here — this bot passes it by catching the one washout
that based and ground back up, then stopping after one loss if the regime
turns against it.

## Files

- `main.ts` — the bot (TypeScript, erasable syntax, Node 22 type stripping)
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte for byte
- `LICENSE` — MIT

## Run it

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process --worktree
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
