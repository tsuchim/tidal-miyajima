// tide-lib.js (ES Module)
// 教科書の(55)(56)の形：η(t)=Z0+Σ f_i H_i cos([V_i+u_i]-κ_i) を実装
//
// ここでは厳島(3423 Itsukushima)の定数（H, κ, Z0）を同梱
// 天文引数 s,h,p,N は(27)-(30)の近似式を使用
// 0:00UTからの時間進行は T/hour=15, s/hour, h/hour, p/hour を使用
// 節補正 f,u は第2表（cosN/sinN 等の係数）を使用

const DEG = Math.PI / 180;

function mod360(x) {
  x %= 360;
  if (x < 0) x += 360;
  return x;
}

function cosd(d) { return Math.cos(d * DEG); }
function sind(d) { return Math.sin(d * DEG); }

function utcMidnight(dateUTC) {
  return new Date(Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate(), 0, 0, 0, 0));
}

function dayOfYearUTC(dateUTC) {
  const start = new Date(Date.UTC(dateUTC.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  const diffMs = utcMidnight(dateUTC) - start;
  return Math.floor(diffMs / 86400000) + 1; // 1-based
}

// 教科書の L=[(Y+3)/4]-500（2000年基準の補助項）
function L_correction(Y) {
  return Math.floor((Y + 3) / 4) - 500;
}

// 教科書の(27)-(30): s,h,p,N（deg）
// D は年初からの通日、式中は (D+L) が入る
function astroArgsAtUTMidnight(dateUTC) {
  const Y = dateUTC.getUTCFullYear();
  const D = dayOfYearUTC(dateUTC);
  const L = L_correction(Y);

  const y = Y - 2000;
  const d = D + L;

  const s = 211.728 + 129.38471 * y + 13.176396 * d;
  const h = 279.974 - 0.23871 * y + 0.985647 * d;
  const p = 83.298 + 40.66229 * y + 0.111404 * d;
  const N = 125.071 - 19.32812 * y - 0.052954 * d;

  return { s: mod360(s), h: mod360(h), p: mod360(p), N: mod360(N) };
}

// 0:00UT からの経過時間 tHours を与えて、T,s,h,p を進める。
// 教科書: T/hour=15, s/hour=0.54901652, h/hour=0.04106864, p/hour=0.00464181
function advanceArgs({ s, h, p, N }, tHours) {
  const T = mod360(15.0 * tHours);
  const s2 = mod360(s + 0.54901652 * tHours);
  const h2 = mod360(h + 0.04106864 * tHours);
  const p2 = mod360(p + 0.00464181 * tHours);
  return { T, s: s2, h: h2, p: p2, N };
}

// 第2表の係数（f は cosN/cos2N/cos3N と sinN 系、u は sinN 系）
// ここでは O1,K1,M2,K2 のみ実装（厳島の定数が載っている主要項に合わせる）
function nodalFU(constituent, Ndeg) {
  // 係数は「第2表」の見た目に合わせて：f = a0 + a1 cosN + a2 cos2N + a3 cos3N
  // u = b1 sinN + b2 sin2N + b3 sin3N （単位は度として扱う）
  // ※表の数値は教科書から転記
  const N = Ndeg;

  const COSN = cosd(N), COS2 = cosd(2 * N), COS3 = cosd(3 * N);
  const SINN = sind(N), SIN2 = sind(2 * N), SIN3 = sind(3 * N);

  // 表にない/不要な項は f=1,u=0
  const out = { f: 1.0, u: 0.0 };

  switch (constituent) {
    case "O1":
      // O1: 1.0089 +0.1871 cosN -0.0147 cos2N +0.0006 cos3N; u = -8.86 sinN +0.68 sin2N -0.07 sin3N
      out.f = 1.0089 + 0.1871 * COSN - 0.0147 * COS2 + 0.0006 * COS3;
      out.u = (-8.86) * SINN + (0.68) * SIN2 + (-0.07) * SIN3;
      return out;
    case "K1":
      // K1: 1.0060 +0.1150 cosN -0.0088 cos2N +0.0016 cos3N; u = -12.94 sinN +1.34 sin2N -0.19 sin3N
      out.f = 1.0060 + 0.1150 * COSN - 0.0088 * COS2 + 0.0016 * COS3;
      out.u = (-12.94) * SINN + (1.34) * SIN2 + (-0.19) * SIN3;
      return out;
    case "M2":
      // M2: 1.0004 -0.0373 cosN +0.0002 cos2N +0.0000 cos3N; u = -2.14 sinN +0 sin2N +0 sin3N
      out.f = 1.0004 + (-0.0373) * COSN + (0.0002) * COS2 + 0.0 * COS3;
      out.u = (-2.14) * SINN + 0.0 * SIN2 + 0.0 * SIN3;
      return out;
    case "K2":
      // K2: 1.0241 +0.2863 cosN +0.0083 cos2N -0.0015 cos3N; u = -17.74 sinN +0.68 sin2N -0.04 sin3N
      out.f = 1.0241 + 0.2863 * COSN + 0.0083 * COS2 + (-0.0015) * COS3;
      out.u = (-17.74) * SINN + (0.68) * SIN2 + (-0.04) * SIN3;
      return out;
    default:
      return out;
  }
}

// 厳島の主要6分潮（教科書のページにH,κが載っているもの）
// a=(a1,a2,a3,a4) は第1表の該当行より（画像の行と一致する組）
// - O1 : 1 -2 1 0 （主太陰日周潮）
// - P1 : 1  0 -1 0 （主太陽日周潮）
// - K1 : 1  0  1 0 （日月合成日周潮）
// - M2 : 2 -2  2 0 （主太陰半日周潮）
// - S2 : 2  0  0 0 （主太陽半日周潮）
// - K2 : 2  0  2 0 （日月合成半日潮）

const ITSUKUSHIMA = {
  name: "Itsukushima (Miyajima)",
  Z0_cm: 200.0,
  constituents: [
    { id: "O1", H_cm: 24.0, kappa_deg: 201.0, a: [1, -2,  1, 0] },
    { id: "P1", H_cm: 10.3, kappa_deg: 219.0, a: [1,  0, -1, 0] },
    { id: "K1", H_cm: 31.0, kappa_deg: 219.0, a: [1,  0,  1, 0] },
    { id: "M2", H_cm:103.0, kappa_deg: 277.0, a: [2, -2,  2, 0] },
    { id: "S2", H_cm: 40.0, kappa_deg: 310.0, a: [2,  0,  0, 0] },
    { id: "K2", H_cm: 10.9, kappa_deg: 310.0, a: [2,  0,  2, 0] },
  ],
};

export class MiyajimaTide {
  constructor(params = ITSUKUSHIMA) {
    this.params = params;
  }

  // date: JavaScript Date（ローカルでもUTCでも可。内部ではUTCに変換して計算）
  heightCmAt(date) {
    const dateUTC = new Date(date.getTime());

    // その日の 0:00UT の天文引数を算出し、時刻分だけ進める
    const mid = utcMidnight(dateUTC);
    const tHours = (dateUTC.getTime() - mid.getTime()) / 3600000;

    const base = astroArgsAtUTMidnight(dateUTC);
    const args = advanceArgs(base, tHours);

    let eta = this.params.Z0_cm;

    for (const c of this.params.constituents) {
      const { f, u } = nodalFU(c.id, args.N);
      const [a1, a2, a3, a4] = c.a;

      // V = a1*T + a2*s + a3*h + a4*p（教科書の形を踏襲）
      const V = a1 * args.T + a2 * args.s + a3 * args.h + a4 * args.p;

      // η寄与 = f*H*cos(V + u - κ)
      const phase = mod360(V + u - c.kappa_deg);
      eta += f * c.H_cm * Math.cos(phase * DEG);
    }

    return eta;
  }

  // 例：分単位で系列を作る（簡易グラフ用）
  seriesCm(startDate, minutes, stepMinutes = 10) {
    const out = [];
    const start = new Date(startDate.getTime());
    const n = Math.floor(minutes / stepMinutes);
    for (let i = 0; i <= n; i++) {
      const d = new Date(start.getTime() + i * stepMinutes * 60000);
      out.push({ t: d, cm: this.heightCmAt(d) });
    }
    return out;
  }
}
