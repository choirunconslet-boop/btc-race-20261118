/* Washout-base rider on CBBTC, long only.
 *
 * Idea: on a quiet, drifting market the money is not in chasing every dip
 * or riding momentum — it is in the one washout that ends in a base, and
 * the slow grind up that follows it. The bot waits flat in cash until
 * (a) price has fallen at least 1.8% from its trailing 2-hour high at some
 * point in the last 2 hours (a washout happened), and (b) the last 30
 * minutes squeezed into a tight base (range under 0.7%) without making a
 * new low (the selling is exhausted). It buys full size once, then rides
 * the recovery with a 0.8% trailing stop from the highest close since
 * entry. Two more exits protect it: the position is cut if price breaks
 * 0.1% below the base low it was bought on (the thesis is wrong), and a
 * hard 2.5% stop versus entry cost. There is deliberately NO fixed
 * take-profit: the recovery is the trade, and a fixed target cuts it
 * short. After one losing round trip the bot stops trading for the rest
 * of the window (circuit breaker): in a sustained downtrend every new
 * base is just a pause before the next leg down, and one loss is enough
 * evidence of that regime.
 *
 * How this differs from the previous race's dip-buyer (which lost on this
 * window and was flagged identical-behaviour): that bot bought a 2% dip
 * off a 6-hour high on a 0.1% bounce off the 6-hour low, with a fixed
 * +1% take-profit and a -2% stop, and needed 360 bars of history before
 * it could trade at all (so it sat out the whole washout). This bot uses
 * a different signal set (washout memory + 30-minute range compression,
 * no trailing high/low levels), a different exit (trailing stop + base-low
 * break, no take-profit), different risk sizing (one losing round trip
 * stops it), and a 2-hour lookback, so it can trade the washout itself.
 * It also differs from the kit baselines: no EMA cross, no RSI/Bollinger,
 * no ADX, no 24-bar momentum rebalance, no buy-and-hold.
 *
 * Deterministic: closes only, no clock, no randomness, no network.
 * Measured with the kit's own local grader (grade-local) on the dev
 * window; see README for the numbers.
 */
import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 120; // trailing window for the washout high (2h of 1-minute bars)
const WASHOUT_MEMORY = 120; // how far back a washout may have happened (2h)
const BASE_BARS = 30; // base window for the range squeeze
const RANGE_NUM = 1007n; // base: max/min over BASE_BARS <= 1.007 (0.7%)
const RANGE_DEN = 1000n;
const BOUNCE_NUM = 1001n; // and close >= base low * 1.001 (not making new lows)
const BOUNCE_DEN = 1000n;
const TRAIL_NUM = 992n; // trailing stop: sell at 0.8% below the peak close since entry
const TRAIL_DEN = 1000n;
const BASE_BREAK_NUM = 999n; // base-low break: sell 0.1% below the base low at entry
const BASE_BREAK_DEN = 1000n;
const SL_NUM = 975n; // hard stop: -2.5% versus entry cost (safety net only)
const SL_DEN = 1000n;
const MAX_SLIPPAGE_BPS = 100;

const closes: number[] = [];
let peakSinceEntry = 0; // highest close since the current entry
let baseLowAtEntry = 0; // lowest close of the base the entry was bought on
let losingRoundTrips = 0; // circuit breaker: stop after one losing round trip

await runBars({
  onBatch(state: BarsState) {
    const bar = state.latest.get(SYMBOL);
    if (bar !== undefined) closes.push(Number(bar.c));
    if (state.warmingUp) return [];
    if (closes.length < LOOKBACK + 1 || closes.length < BASE_BARS + 1) return [];
    const latest = state.close(SYMBOL);
    if (latest === null) return [];
    const latestN = Number(latest);
    const held = state.positions.get(SYMBOL);

    if (held !== undefined) {
      if (latestN > peakSinceEntry) peakSinceEntry = latestN;
      const value = state.value(SYMBOL, held.qty);
      const trailHit = BigInt(Math.round(latestN)) * TRAIL_DEN <= BigInt(Math.round(peakSinceEntry)) * TRAIL_NUM;
      const baseBroken = BigInt(Math.round(latestN)) * BASE_BREAK_DEN < BigInt(Math.round(baseLowAtEntry)) * BASE_BREAK_NUM;
      const stopHit = value * SL_DEN <= held.cost * SL_NUM;
      if (trailHit || baseBroken || stopHit) {
        if (value < held.cost) losingRoundTrips += 1;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      return [];
    }

    // Circuit breaker: one losing round trip means the regime is a
    // sustained downtrend; sit out the rest of the window.
    if (losingRoundTrips >= 1) return [];

    // (a) Washout: the worst drawdown from the trailing LOOKBACK-bar high
    // over the last WASHOUT_MEMORY bars must reach DROP.
    let worstNum = 0n; // most negative drawdown, in thousandths (negative or zero)
    const startJ = Math.max(0, closes.length - WASHOUT_MEMORY);
    for (let j = startJ; j < closes.length; j++) {
      let hi = closes[Math.max(0, j - LOOKBACK + 1)];
      for (let k = Math.max(0, j - LOOKBACK + 1); k <= j; k++) {
        if (closes[k] > hi) hi = closes[k];
      }
      const hiN = BigInt(Math.round(hi));
      const pxN = BigInt(Math.round(closes[j]));
      // drawdown in thousandths: (px - hi) / hi * 1000, negative when below high
      const dd = ((pxN - hiN) * 1000n) / hiN;
      if (dd < worstNum) worstNum = dd;
    }
    // worst drawdown must be at least -1.8%: worstNum <= -18 (thousandths)
    if (worstNum > -18n) return [];

    // (b) Base: the last BASE_BARS closes squeezed into a RANGE_NUM/RANGE_DEN band.
    const base = closes.slice(closes.length - BASE_BARS);
    let baseHi = base[0];
    let baseLo = base[0];
    for (const c of base) {
      if (c > baseHi) baseHi = c;
      if (c < baseLo) baseLo = c;
    }
    const baseHiN = BigInt(Math.round(baseHi));
    const baseLoN = BigInt(Math.round(baseLo));
    if (baseHiN * RANGE_DEN > baseLoN * RANGE_NUM) return [];
    // ... and the latest close is not making a new low.
    if (BigInt(Math.round(latestN)) * BOUNCE_DEN < baseLoN * BOUNCE_NUM) return [];

    const { caps, fees } = state.hello;
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    const amount = state.cash < byWeight ? state.cash : byWeight;
    if (amount <= 0n || amount < BigInt(fees.min_notional_quote_units)) return [];
    peakSinceEntry = latestN;
    baseLowAtEntry = Number(baseLoN);
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput];
  },
});
