// tide-lib.js (ES Module)
// 教科書(55)(56)式：η(t)=Z0+Σ f_i H_i cos([V_i(t)+u_i]-κ_i)
// - 公開APIは UTC Date のみ
// - V_i(t) は天文角の線形結合（ωt を別途足さない）
// - N は昇交点経度 Ω（減少）
// - a5*N を含む一般形を実装（現行6分潮は a5=0）

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

function utcMidnightMs(dateUTC) {
  return Date.UTC(
    dateUTC.getUTCFullYear(),
    dateUTC.getUTCMonth(),
    dateUTC.getUTCDate(),
    0, 0, 0, 0
  );
}

function dayOfYearUTC(dateUTC) {
  const startMs = Date.UTC(dateUTC.getUTCFullYear(), 0, 1);
  return Math.floor((utcMidnightMs(dateUTC) - startMs) / DAY_MS);
}

// 教科書の補助項 L = floor((Y+3)/4) - 500
function L_correction(year) {
  return Math.floor((year + 3) / 4) - 500;
}

// 教科書(27)-(30): UT 0:00 における天文角
function astroArgsAtUTMidnight(dateUTC) {
  const year = dateUTC.getUTCFullYear();
  const D = dayOfYearUTC(dateUTC);
  const L = L_correction(year);

  const y = year - 2000;
  const d = D + L;

  const s = 211.728 + 129.38471 * y + 13.176396 * d;
  const h = 279.974 - 0.23871 * y + 0.985647 * d;
  const p = 83.298 + 40.66229 * y + 0.111404 * d;
  // N = 昇交点経度 Ω（減少）
  const N = 125.071 - 19.32812 * y - 0.052954 * d;

  return {
    s: mod360(s),
    h: mod360(h),
    p: mod360(p),
    N: mod360(N),
  };
}

// UT 0:00 から tHours 進める
function advanceArgs({ s, h, p, N }, tHours) {
  // 教科書規約：T(0:00UT)=180°
  const T = mod360(180.0 + 15.0 * tHours);
  return {
    T,
    s: mod360(s + 0.54901652 * tHours),
    h: mod360(h + 0.04106864 * tHours),
    p: mod360(p + 0.00464181 * tHours),
    N, // 日内変化は無視（教科書近似）
  };
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
        f: 1.0089 + 0.1871 * COSN - 0.0147 * COS2 + 0.0006 * COS3,
        u: -8.86 * SINN + 0.68 * SIN2 - 0.07 * SIN3,
      };
    case "K1":
      return {
        f: 1.0060 + 0.1150 * COSN - 0.0088 * COS2 + 0.0016 * COS3,
        u: -12.94 * SINN + 1.34 * SIN2 - 0.19 * SIN3,
      };
    case "M2":
      return {
        f: 1.0004 - 0.0373 * COSN + 0.0002 * COS2,
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

export const ITSUKUSHIMA_PARAMS = Object.freeze({
  name: "Itsukushima (Miyajima)",
  Z0_cm: 200.0,
  constituents: Object.freeze([
    // a = [a1, a2, a3, a4, a5]
    { id: "O1", H_cm: 24.0, kappa_deg: 201.0, a: [1, 1, 0, 0, 0] },
    { id: "P1", H_cm: 10.3, kappa_deg: 219.0, a: [1, 0, -1, 0, 0] },
    { id: "K1", H_cm: 31.0, kappa_deg: 219.0, a: [1, 0, 1, 0, 0] },
    { id: "M2", H_cm: 103.0, kappa_deg: 277.0, a: [2, -2, 0, 0, 0] },
    { id: "S2", H_cm: 40.0, kappa_deg: 310.0, a: [2, 0, 0, 0, 0] },
    { id: "K2", H_cm: 10.9, kappa_deg: 310.0, a: [2, 0, 2, 0, 0] },
  ]),
});

function heightCmAtUTCWithDayCtx(dateUtc, params, dayCtx) {
  const tHours = (dateUtc.getTime() - dayCtx.midnightMs) / HOUR_MS;
  const args = advanceArgs(dayCtx.base, tHours);

  let eta = params.Z0_cm;

  for (let i = 0; i < params.constituents.length; i++) {
    const c = params.constituents[i];
    const { f, u } = dayCtx.fu[i];
    const [a1, a2, a3, a4, a5] = c.a;

    const V =
      a1 * args.T +
      a2 * args.s +
      a3 * args.h +
      a4 * args.p +
      a5 * args.N;

    const phase = mod360(V + u - c.kappa_deg);
    eta += f * c.H_cm * Math.cos(phase * DEG);
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
