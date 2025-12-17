// tide-lib.js (ES Module)
// PDF: "Harmonic Tide Prediction Model (Reconstructed)"
// - η(t)=Z0+Σ f_i H_i cos(V_i(t)+u_i-κ_i)
// - V_i(t)=a1*τ+a2*s+a3*h+a4*p+a5*N (+ a6*p′; this demo ignores p′)
// - All inputs are UTC instants (Date)
// NOTE: Here τ is treated as Doodson/Schureman "mean lunar time" (τ = T + h − s).

const DEG = Math.PI / 180;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// J2000 epoch (Jan 1, 2000 12:00 UTC) - standard astronomical reference time
// Used as the base epoch for all astronomical argument approximations.
const J2000_12_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0);

function mod360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function cosd(d) { return Math.cos(d * DEG); }
function sind(d) { return Math.sin(d * DEG); }

function utcMidnightMs(dateUTC) {
  return Date.UTC(
    dateUTC.getUTCFullYear(),
    dateUTC.getUTCMonth(),
    dateUTC.getUTCDate(),
    0, 0, 0, 0
  );
}

function daysSinceJ2000_12UTC(msUtc) {
  return (msUtc - J2000_12_UTC_MS) / DAY_MS;
}

// PDF 6.x: UT 0:00 における天文角（線形近似）
function astroArgsAtUTMidnight(dateUTC) {
  const midMs = utcMidnightMs(dateUTC);
  const d = daysSinceJ2000_12UTC(midMs);

  // Mean longitudes (deg). Rates are in deg/day.
  const s = 218.3167 + 13.1763965 * d; // Moon (deg/day)
  const h = 279.974 + 0.985647 * d; // Sun  (deg/day)
  const p = 83.353 + 0.111404 * d; // lunar perigee (deg/day)

  // Node angle N (as written in the reconstructed PDF's simplified form)
  const N = 125.044 - 0.052954 * d;

  return {
    s: mod360(s),
    h: mod360(h),
    p: mod360(p),
    N: mod360(N),
  };
}

// Advance angles from UT 0:00 by tHours.
function advanceArgs({ s, h, p, N }, tHours, params) {
  // Fundamental angles at time t.
  const sNow = mod360(s + 0.54901652 * tHours);
  const hNow = mod360(h + 0.04106864 * tHours);
  const pNow = mod360(p + 0.00464181 * tHours);

  // Mean solar angle at Greenwich (deg), 0° at 0:00 UTC and +15°/hour (mod 360).
  const T = mod360(15.0 * tHours);

  // Doodson/Schureman-style mean lunar time (τ):
  // τ = T + h − s  (so that dτ/dt ≈ 15 + dh/dt − ds/dt ≈ 14.492°/h)
  //
  // Some harmonic-constant tables define phases using a local reference meridian and/or a shifted τ origin.
  // To support those sources in a principled way, we allow:
  // - `referenceLongitude_deg`: east-positive degrees added to τ (e.g. station longitude).
  // - `tauOffset_deg`: a constant offset added to τ (e.g. 180° in some published conventions).
  const referenceLongitude = params?.referenceLongitude_deg ?? 0.0;
  const tauOffset = params?.tauOffset_deg ?? 0.0;
  const tau = mod360(T + hNow - sNow + referenceLongitude + tauOffset);
  return {
    tau,
    s: sNow,
    h: hNow,
    p: pNow,
    N, // Daily variation is ignored (textbook approximation).
  };
}

// 第2表 nodal factor
function nodalFU(id, Ndeg) {
  const COSN = cosd(Ndeg);
  const COS2 = cosd(2 * Ndeg);
  const SINN = sind(Ndeg);
  const SIN2 = sind(2 * Ndeg);

  switch (id) {
    case "O1":
      // Small-angle nodal corrections (degrees), consistent with standard NOAA/JMA practice.
      return {
        f: 1.0 + 0.188 * COSN + 0.014 * COS2,
        u: 1.73 * SINN + 0.043 * SIN2,
      };
    case "K1":
      return {
        f: 1.006 + 0.115 * COSN - 0.009 * COS2,
        u: -0.505 * SINN - 0.020 * SIN2,
      };
    case "M2":
      return {
        f: 1.0004 - 0.0373 * COSN + 0.0002 * COS2,
        u: -2.14 * SINN,
      };
    default:
      return { f: 1.0, u: 0.0 };
  }
}

export const ITSUKUSHIMA_PARAMS = Object.freeze({
  name: "Itsukushima (Miyajima) - JCG harmonic constants",
  // Values transcribed from the Hydrographic Dept. (JCG) sheet (H[cm], κ[deg], Z0[cm]).
  // This is a first-principles harmonic prediction model: the library does NOT depend on external sites.
  //
  // NOTE:
  // - The sheet does not explicitly state the phase convention / reference meridian.
  // - JCG's own web predictor output for this station is best matched with:
  //   `phaseConvention: "cos"`, `referenceLongitude_deg: station longitude (east+)`, `tauOffset_deg: 180`.
  // - Other datasets may use different conventions; the library exposes these knobs for compatibility.
  phaseConvention: "cos", // "sin" | "cos"
  referenceLongitude_deg: 132 + 19 / 60, // 132°19′E
  tauOffset_deg: 180.0,
  Z0_cm: 200.0,
  constituents: Object.freeze([
    // a = [a1, a2, a3, a4, a5] for V = a1*τ + a2*s + a3*h + a4*p + a5*N
    // (τ is mean lunar time; see advanceArgs()).
    { id: "O1", H_cm: 24.0, kappa_deg: 201.0, a: [1, -1, 0, 0, 0] }, // τ − s
    { id: "P1", H_cm: 10.3, kappa_deg: 219.0, a: [1, 1, -2, 0, 0] }, // τ + s − 2h
    { id: "K1", H_cm: 31.0, kappa_deg: 219.0, a: [1, 1, 0, 0, 0] }, // τ + s
    { id: "M2", H_cm: 103.0, kappa_deg: 277.0, a: [2, 0, 0, 0, 0] }, // 2τ
    { id: "S2", H_cm: 40.0, kappa_deg: 310.0, a: [2, 2, -2, 0, 0] }, // 2τ + 2s − 2h (= 2T)
    { id: "K2", H_cm: 10.9, kappa_deg: 310.0, a: [2, 2, 0, 0, 0] }, // 2τ + 2s
  ]),
});

function heightCmAtUTCWithDayCtx(dateUtc, params, dayCtx) {
  const tHours = (dateUtc.getTime() - dayCtx.midnightMs) / HOUR_MS;
  const args = advanceArgs(dayCtx.base, tHours, params);

  let eta = params.Z0_cm;
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
      a1 * args.tau +
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
