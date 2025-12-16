// tide-lib.js (ES Module)
// 教科書の(55)(56)の形：η(t)=Z0+Σ f_i H_i cos([V_i+u_i]-κ_i) を実装
//
// - 公開APIはUTC instant の Date 入力のみ
// - 外部依存なし（ブラウザのみで計算）
// - デモ側で必要に応じて JST→UTC 変換する

/**
 * @typedef {Object} TideConstituent
 * @property {string} id
 * @property {number} H_cm
 * @property {number} kappa_deg
 * @property {[number, number, number, number]} a
 */

/**
 * @typedef {Object} TideParams
 * @property {string} name
 * @property {number} Z0_cm
 * @property {ReadonlyArray<TideConstituent>} constituents
 */

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
  return Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate(), 0, 0, 0, 0);
}

function dayOfYearUTC(dateUTC) {
  const startMs = Date.UTC(dateUTC.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
  const midMs = utcMidnightMs(dateUTC);
  // 0-based: Jan 1st => 0
  // (The textbook-style approximations used below assume D=0 at Jan 1 0:00 UT.)
  return Math.floor((midMs - startMs) / DAY_MS);
}

// 教科書の L=[(Y+3)/4]-500（2000年基準の補助項）
function L_correction(year) {
  return Math.floor((year + 3) / 4) - 500;
}

// 教科書の(27)-(30): s,h,p,N（deg）
// D は年初からの通日、式中は (D+L) が入る
function astroArgsAtUTMidnight(dateUTC) {
  const year = dateUTC.getUTCFullYear();
  const day = dayOfYearUTC(dateUTC);
  const L = L_correction(year);

  const y = year - 2000;
  const d = day + L;

  const s = 211.728 + 129.38471 * y + 13.176396 * d;
  const h = 279.974 - 0.23871 * y + 0.985647 * d;
  const p = 83.298 + 40.66229 * y + 0.111404 * d;
  const N = 125.071 - 19.32812 * y - 0.052954 * d;

  return { s: mod360(s), h: mod360(h), p: mod360(p), N: mod360(N) };
}

// 0:00UT からの経過時間 tHours を与えて、T,s,h,p を進める。
// 教科書: T/hour=15, s/hour=0.54901652, h/hour=0.04106864, p/hour=0.00464181
function advanceArgs({ s, h, p, N }, tHours) {
  // Textbook/Schureman convention: T(0:00UT) = 180° so that T=0° at 12:00UT.
  const T = mod360(180.0 + 15.0 * tHours);
  return {
    T,
    s: mod360(s + 0.54901652 * tHours),
    h: mod360(h + 0.04106864 * tHours),
    p: mod360(p + 0.00464181 * tHours),
    N,
  };
}

// 第2表の係数（f は cosN/cos2N/cos3N と sinN 系、u は sinN 系）
// ここでは O1,K1,M2,K2 のみ実装（厳島の定数が載っている主要項に合わせる）
function nodalFU(constituent, Ndeg) {
  const COSN = cosd(Ndeg);
  const COS2 = cosd(2 * Ndeg);
  const COS3 = cosd(3 * Ndeg);
  const SINN = sind(Ndeg);
  const SIN2 = sind(2 * Ndeg);
  const SIN3 = sind(3 * Ndeg);

  switch (constituent) {
    case "O1":
      return {
        f: 1.0089 + 0.1871 * COSN - 0.0147 * COS2 + 0.0006 * COS3,
        u: (-8.86) * SINN + (0.68) * SIN2 + (-0.07) * SIN3,
      };
    case "K1":
      return {
        f: 1.0060 + 0.1150 * COSN - 0.0088 * COS2 + 0.0016 * COS3,
        u: (-12.94) * SINN + (1.34) * SIN2 + (-0.19) * SIN3,
      };
    case "M2":
      return {
        f: 1.0004 + (-0.0373) * COSN + (0.0002) * COS2,
        u: (-2.14) * SINN,
      };
    case "K2":
      return {
        f: 1.0241 + 0.2863 * COSN + 0.0083 * COS2 + (-0.0015) * COS3,
        u: (-17.74) * SINN + (0.68) * SIN2 + (-0.04) * SIN3,
      };
    default:
      return { f: 1.0, u: 0.0 };
  }
}

function freezeParams(params) {
  return Object.freeze({
    ...params,
    constituents: Object.freeze(params.constituents.map(c => Object.freeze({ ...c, a: Object.freeze([...c.a]) }))),
  });
}

// 厳島の主要6分潮（教科書のページにH,κが載っているもの）
// a=(a1,a2,a3,a4) は第1表の該当行より
export const ITSUKUSHIMA_PARAMS =
  freezeParams({
    name: "Itsukushima (Miyajima)",
    Z0_cm: 200.0,
    constituents: [
      // Doodson-style equilibrium arguments with (T, s, h, p) multipliers.
      // O1: T + s
      { id: "O1", H_cm: 24.0, kappa_deg: 201.0, a: [1, 1, 0, 0] },
      { id: "P1", H_cm: 10.3, kappa_deg: 219.0, a: [1, 0, -1, 0] },
      { id: "K1", H_cm: 31.0, kappa_deg: 219.0, a: [1, 0, 1, 0] },
      // M2: 2T - 2s
      { id: "M2", H_cm: 103.0, kappa_deg: 277.0, a: [2, -2, 0, 0] },
      { id: "S2", H_cm: 40.0, kappa_deg: 310.0, a: [2, 0, 0, 0] },
      { id: "K2", H_cm: 10.9, kappa_deg: 310.0, a: [2, 0, 2, 0] },
    ],
  });

function assertValidDate(date, name) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }
}

function assertFiniteNumber(n, name) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function heightCmAtUTCWithDayCtx(dateUtc, params, dayCtx) {
  const tHours = (dateUtc.getTime() - dayCtx.midnightMs) / HOUR_MS;
  const args = advanceArgs(dayCtx.base, tHours);

  let eta = params.Z0_cm;
  const list = params.constituents;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const { f, u } = dayCtx.fu[i];
    const [a1, a2, a3, a4] = c.a;

    // V = a1*T + a2*s + a3*h + a4*p（教科書の形を踏襲）
    const V = a1 * args.T + a2 * args.s + a3 * args.h + a4 * args.p;
    const phase = mod360(V + u - c.kappa_deg);
    eta += f * c.H_cm * Math.cos(phase * DEG);
  }
  return eta;
}

function createDayContext(midnightMs, params) {
  const midDate = new Date(midnightMs);
  const base = astroArgsAtUTMidnight(midDate);
  const fu = params.constituents.map(c => nodalFU(c.id, base.N));
  return { midnightMs, base, fu };
}

/**
 * 指定の日時(UTC)における潮位(cm)を計算します。
 * @param {Date} dateUtc - UTC instant を表す Date
 * @param {TideParams} [params]
 * @returns {number}
 */
export function heightCmAtUTC(dateUtc, params = ITSUKUSHIMA_PARAMS) {
  assertValidDate(dateUtc, "dateUtc");
  const midnightMs = utcMidnightMs(dateUtc);
  const dayCtx = createDayContext(midnightMs, params);
  return heightCmAtUTCWithDayCtx(dateUtc, params, dayCtx);
}

/**
 * 指定の期間(UTC)の潮位系列を計算します（戻り値の各要素は `{ tUTC: Date, cm: number }`）。
 * @param {Date} startDateUtc - UTC instant を表す Date
 * @param {number} minutes
 * @param {number} [stepMinutes=10]
 * @param {TideParams} [params]
 * @returns {Array<{tUTC: Date, cm: number}>}
 */
export function seriesCmAtUTC(startDateUtc, minutes, stepMinutes = 10, params = ITSUKUSHIMA_PARAMS) {
  assertValidDate(startDateUtc, "startDateUtc");
  assertFiniteNumber(minutes, "minutes");
  assertFiniteNumber(stepMinutes, "stepMinutes");
  if (minutes < 0) throw new RangeError("minutes must be >= 0");
  if (stepMinutes <= 0) throw new RangeError("stepMinutes must be > 0");

  const out = [];
  const startMs = startDateUtc.getTime();
  const stepMs = stepMinutes * MINUTE_MS;
  const n = Math.floor(minutes / stepMinutes);

  /** @type {{midnightMs:number, base:{s:number,h:number,p:number,N:number}, fu:Array<{f:number,u:number}>}|null} */
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
  /**
   * @param {TideParams} [params]
   */
  constructor(params = ITSUKUSHIMA_PARAMS) {
    this.params = params;
  }

  /**
   * @param {Date} dateUtc
   * @returns {number}
   */
  heightCmAtUTC(dateUtc) {
    return heightCmAtUTC(dateUtc, this.params);
  }

  /**
   * @param {Date} startDateUtc
   * @param {number} minutes
   * @param {number} [stepMinutes=10]
   * @returns {Array<{tUTC: Date, cm: number}>}
   */
  seriesCmAtUTC(startDateUtc, minutes, stepMinutes = 10) {
    return seriesCmAtUTC(startDateUtc, minutes, stepMinutes, this.params);
  }
}
