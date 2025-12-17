// tide-lib.js (ES Module)
// PDF: "Harmonic Tide Prediction Model (Reconstructed)"
// - η(t)=Z0+Σ f_i H_i cos(V_i(t)+u_i-κ_i)
// - V_i(t)=a1*T+a2*s+a3*h+a4*p+a5*N (+ a6*p′; this demo ignores p′)
// - All inputs are UTC instants (Date)
//
// IMPORTANT:
// This implementation follows `docs/HarmonicTidePredictionModel.md`:
// - Compute fundamental angles at 0:00 UTC using the document's year/day approximation.
// - Advance within the day using fixed hourly rates.
// - Use Doodson-style linear combinations in terms of T,s,h,p (and optional N).

const DEG = Math.PI / 180;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function mod360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function cosd(d) { return Math.cos(d * DEG); }
function sind(d) { return Math.sin(d * DEG); }

function doyFractionInTz(dateUtc, tzOffsetMinutes) {
  const offsetMs = (tzOffsetMinutes ?? 0) * MINUTE_MS;
  const localMs = dateUtc.getTime() + offsetMs;
  const local = new Date(localMs);
  const jan1LocalMs = Date.UTC(local.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
  return (localMs - jan1LocalMs) / DAY_MS;
}

function utcMidnightMs(dateUTC) {
  return Date.UTC(
    dateUTC.getUTCFullYear(),
    dateUTC.getUTCMonth(),
    dateUTC.getUTCDate(),
    0, 0, 0, 0
  );
}

function dayOfYear0(dateUTC) {
  const y = dateUTC.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1, 0, 0, 0, 0);
  const mid = utcMidnightMs(dateUTC);
  return Math.floor((mid - jan1) / DAY_MS);
}

// docs/HarmonicTidePredictionModel.md 3.2: 0:00 UTC における天文角（年・通日近似）
function astroArgsAtUTMidnight(dateUTC) {
  const Y = dateUTC.getUTCFullYear();
  const D = dayOfYear0(dateUTC);
  const y = Y - 2000;
  const L = Math.floor((Y + 3) / 4) - 500;
  const d = D + L;

  const s = 211.728 + 129.38471 * y + 13.176396 * d;
  const h = 279.974 - 0.23871 * y + 0.985647 * d;
  const p = 83.298 + 40.66229 * y + 0.111404 * d;
  // IMPORTANT: N decreases with time (retrograde).
  const N = 125.071 - 19.32812 * y - 0.052954 * d;

  return { s: mod360(s), h: mod360(h), p: mod360(p), N: mod360(N) };
}

// Advance angles from UT 0:00 by tHours.
function advanceArgs({ s, h, p, N }, tHours) {
  // docs/HarmonicTidePredictionModel.md 3.3
  // T: base angle advancing at 15°/hour.
  // Some harmonic-constant tables define the epoch κ relative to a local reference meridian.
  // To support that as an interpretation issue (not a fitted constant), we optionally shift T by longitude.
  const T0 = 180.0;
  const T = mod360(T0 + 15.0 * tHours);
  const sNow = mod360(s + 0.5490165 * tHours);
  const hNow = mod360(h + 0.0410687 * tHours);
  const pNow = mod360(p + 0.0046418 * tHours);
  return { T, s: sNow, h: hNow, p: pNow, N };
}

// 第2表 nodal factor
function nodalFU(id, Ndeg) {
  const COSN = cosd(Ndeg);
  const COS2 = cosd(2 * Ndeg);
  const COS3 = cosd(3 * Ndeg);
  const SINN = sind(Ndeg);
  const SIN2 = sind(2 * Ndeg);
  const SIN3 = sind(3 * Ndeg);

  switch (id) {
    case "O1":
      return {
        f: 1.0089 + 0.1871 * COSN - 0.0147 * COS2 + 0.0014 * COS3,
        u: 10.80 * SINN - 1.34 * SIN2 + 0.19 * SIN3,
      };
    case "K1":
      return {
        f: 1.0060 + 0.1150 * COSN - 0.0088 * COS2 + 0.0006 * COS3,
        u: -8.86 * SINN + 0.68 * SIN2 - 0.07 * SIN3,
      };
    case "M2":
      return {
        f: 1.0004 + 0.0373 * COSN + 0.0002 * COS2,
        u: -2.14 * SINN,
      };
    case "K2":
      return {
        f: 1.0241 + 0.2863 * COSN + 0.0083 * COS2 - 0.0015 * COS3,
        u: -17.74 * SINN + 0.68 * SIN2 - 0.04 * SIN3,
      };
    default:
      return { f: 1.0, u: 0.0 };
  }
}

function seasonalMeanAnomalyCm(dateUtc, model) {
  if (!model) return 0.0;
  if (model.type !== "annual+semiannual") return 0.0;
  const JST_OFFSET_MINUTES = 540; // Japan Standard Time (UTC+9)
  const d = doyFractionInTz(dateUtc, tzOffsetMinutes);
  const w = (2 * Math.PI) / 365.2422;
  const phi1 = (model.annual?.phase_deg ?? 0) * DEG;
  const phi2 = (model.semiannual?.phase_deg ?? 0) * DEG;
  const a1 = model.annual?.amp_cm ?? 0;
  const a2 = model.semiannual?.amp_cm ?? 0;
  return a1 * Math.cos(w * d - phi1) + a2 * Math.cos(2 * w * d - phi2);
}

export const ITSUKUSHIMA_PARAMS = Object.freeze({
  name: "Itsukushima (Miyajima) - JCG harmonic constants",
  // Values transcribed from the Hydrographic Dept. (JCG) sheet (H[cm], κ[deg], Z0[cm]).
  // This is a first-principles harmonic prediction model: the library does NOT depend on external sites.
  //
  // NOTE: This parameter sheet does not explicitly state the phase convention / reference meridian.
  phaseConvention: "cos", // "sin" | "cos"
  // Interpretation knob: when κ is referenced to the station meridian (not Greenwich), shift T by longitude (east+).
  // The sheet header lists 132°19′E.
  referenceLongitude_deg: 132 + 19 / 60,
  // Mean sea level seasonal variation:
  // JCG's public predictor notes: "Includes the seasonal change of mean sea level."
  // The parameter sheet does not provide a seasonal term, so we use Hiroshima (area=3419) as a proxy and
  // fit an annual+semiannual anomaly model from JCG's published hourly predictions for year 2025.
  // This is an additive anomaly with ~0 yearly mean (cm) in local time (JST).
  seasonalMeanModel: Object.freeze({
    type: "annual+semiannual",
    tzOffsetMinutes: 540,
    annual: Object.freeze({ amp_cm: 16.60, phase_deg: -131.93 }),
    semiannual: Object.freeze({ amp_cm: 2.02, phase_deg: -170.64 }),
  }),
  Z0_cm: 200.0,
  constituents: Object.freeze([
    // a = [a1, a2, a3, a4, a5] for V = a1*T + a2*s + a3*h + a4*p + a5*N
    // (Matches docs/HarmonicTidePredictionModel.md)
    { id: "O1", H_cm: 24.0, kappa_deg: 201.0, a: [1, -2, 1, 0, 0] }, // T − 2s + h
    { id: "P1", H_cm: 10.3, kappa_deg: 219.0, a: [1, 0, -1, 0, 0] }, // T − h
    { id: "K1", H_cm: 31.0, kappa_deg: 219.0, a: [1, 0, 1, 0, 0] }, // T + h
    { id: "M2", H_cm: 103.0, kappa_deg: 277.0, a: [2, -2, 2, 0, 0] }, // 2T − 2s + 2h
    { id: "S2", H_cm: 40.0, kappa_deg: 310.0, a: [2, 0, 0, 0, 0] }, // 2T
    { id: "K2", H_cm: 10.9, kappa_deg: 310.0, a: [2, 0, 2, 0, 0] }, // 2T + 2h
  ]),
});

function heightCmAtUTCWithDayCtx(dateUtc, params, dayCtx) {
  const tHours = (dateUtc.getTime() - dayCtx.midnightMs) / HOUR_MS;
  const args = advanceArgs(dayCtx.base, tHours);
  const T = mod360(args.T + (params.referenceLongitude_deg ?? 0.0));

  let eta = params.Z0_cm + seasonalMeanAnomalyCm(dateUtc, params.seasonalMeanModel);
  const phaseConvention = params.phaseConvention ?? "cos";
  
  // Validate phase convention
  if (phaseConvention !== "sin" && phaseConvention !== "cos") {
    throw new Error(`Invalid phaseConvention: "${phaseConvention}". Must be "sin" or "cos".`);
  }

  for (let i = 0; i < params.constituents.length; i++) {
    const c = params.constituents[i];
    const { f, u } = dayCtx.fu[i];
    const [a1, a2, a3, a4, a5] = c.a;

    const V =
      a1 * T +
      a2 * args.s +
      a3 * args.h +
      a4 * args.p +
      a5 * args.N;

    // v0: optional equilibrium argument offset (in degrees); default = 0
    // phase = V + v0 + u - κ (where u is nodal correction, κ is phase lag)
    const v0 = c.v0_deg ?? 0.0;
    const phase = mod360(V + v0 + u - c.kappa_deg);
    if (phaseConvention === "sin") {
      eta += f * c.H_cm * Math.sin(phase * DEG);
    } else {
      eta += f * c.H_cm * Math.cos(phase * DEG);
    }
  }
  return eta;
}

function createDayContext(midnightMs, params) {
  const base = astroArgsAtUTMidnight(new Date(midnightMs));
  const fu = params.constituents.map(c => nodalFU(c.id, base.N));
  return { midnightMs, base, fu };
}

export function heightCmAtUTC(dateUtc, params = ITSUKUSHIMA_PARAMS) {
  if (!(dateUtc instanceof Date) || Number.isNaN(dateUtc.getTime())) {
    throw new TypeError("dateUtc must be a valid Date");
  }
  const midnightMs = utcMidnightMs(dateUtc);
  const ctx = createDayContext(midnightMs, params);
  return heightCmAtUTCWithDayCtx(dateUtc, params, ctx);
}

/**
 * 指定の期間(UTC)の潮位系列を計算します（戻り値の各要素は `{ tUTC: Date, cm: number }`）。
 * @param {Date} startDateUtc - UTC instant を表す Date
 * @param {number} minutes
 * @param {number} [stepMinutes=10]
 * @param {object} [params]
 * @returns {Array<{tUTC: Date, cm: number}>}
 */
export function seriesCmAtUTC(startDateUtc, minutes, stepMinutes = 10, params = ITSUKUSHIMA_PARAMS) {
  if (!(startDateUtc instanceof Date) || Number.isNaN(startDateUtc.getTime())) {
    throw new TypeError("startDateUtc must be a valid Date");
  }
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
    throw new TypeError("minutes must be a finite number >= 0");
  }
  if (typeof stepMinutes !== "number" || !Number.isFinite(stepMinutes) || stepMinutes <= 0) {
    throw new TypeError("stepMinutes must be a finite number > 0");
  }

  const out = [];
  const startMs = startDateUtc.getTime();
  const stepMs = stepMinutes * MINUTE_MS;
  const n = Math.floor(minutes / stepMinutes);

  let dayCtx = null;

  for (let i = 0; i <= n; i++) {
    const tMs = startMs + i * stepMs;
    const d = new Date(tMs);

    const midMs = utcMidnightMs(d);
    if (!dayCtx || dayCtx.midnightMs !== midMs) {
      dayCtx = createDayContext(midMs, params);
    }

    out.push({ tUTC: d, cm: heightCmAtUTCWithDayCtx(d, params, dayCtx) });
  }

  return out;
}

export class MiyajimaTide {
  constructor(params = ITSUKUSHIMA_PARAMS) {
    this.params = params;
  }

  heightCmAtUTC(dateUtc) {
    return heightCmAtUTC(dateUtc, this.params);
  }

  seriesCmAtUTC(startDateUtc, minutes, stepMinutes = 10) {
    return seriesCmAtUTC(startDateUtc, minutes, stepMinutes, this.params);
  }
}
