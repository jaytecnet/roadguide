/**
 * Extended Kalman Filter for GPS smoothing on road trips.
 *
 * State vector: [x, y, vx, vy] in metres (local ENU — East/North/Up, ignoring Up)
 *   - (x, y)   = vehicle position in metres relative to a reference origin
 *   - (vx, vy) = velocity in metres per second
 *
 * Motion model: constant velocity (with process noise capturing acceleration).
 *
 * Why an EKF (not just smoothing): phone GPS at highway speeds is noisy
 * (jumps of 10-20 m are common). The EKF fuses the time-series of GPS fixes
 * with a kinematic motion model, producing:
 *   - Smoothed position (less jittery, better for trigger matching)
 *   - Velocity estimate (used for direction detection + speed display)
 *   - Predicted next position (allows trigger pre-evaluation)
 *
 * Tuning (re-tuned from TCWL pattern for Wheatbelt highway speeds):
 *   - Process noise σ_a = 2.5 m/s² — captures braking/acceleration on highways
 *     (typical car max accel ~3 m/s², braking ~5 m/s²; 2.5 is a balance)
 *   - Measurement noise σ_gps = position.accuracy from the GPS fix (typically
 *     3-15 m for phone GPS in open Wheatbelt terrain)
 *
 * Reference: Brown & Hwang, "Introduction to Random Signals and Applied
 * Kalman Filtering", chapter on constant-velocity models.
 */

export interface EkfState {
  /** State vector [x, y, vx, vy] in metres and m/s. */
  x: Float64Array;
  /** 4×4 covariance matrix, row-major. */
  P: Float64Array;
  /** Reference origin (lat, lon) for ENU conversion. Set on first update. */
  origin?: { lat: number; lon: number };
  /** Timestamp of last update, in ms since epoch. */
  lastTimeMs: number;
  /** Whether the filter has been initialised. */
  initialised: boolean;
}

export interface GpsFix {
  lat: number;
  lon: number;
  /** GPS accuracy in metres (from Position.coords.accuracy). */
  accuracy: number;
  /** Speed in m/s, if available (from Position.coords.speed). NaN if not. */
  speed?: number;
  /** Timestamp in ms since epoch. */
  timestamp: number;
}

export interface EkfOutput {
  /** Smoothed position in lat/lon. */
  lat: number;
  lon: number;
  /** Smoothed velocity in m/s. */
  speedMs: number;
  /** Heading in degrees (0 = north, 90 = east), or NaN if speed < 0.5 m/s. */
  headingDeg: number;
  /** Position uncertainty (1-sigma) in metres. */
  accuracy: number;
  /** Timestamp of this estimate. */
  timestamp: number;
}

/** Process noise — acceleration variance (m/s²)². */
const SIGMA_A = 2.5;
/** Minimum GPS accuracy we'll trust (m). Below this, treat as bad fix. */
const MIN_ACCURACY = 3;
/** Maximum GPS accuracy we'll accept (m). Above this, reject the fix. */
const MAX_ACCURACY = 50;

/** Earth radius in metres. */
const EARTH_R = 6371000;

/** Create an empty EKF state. */
export function createEkf(): EkfState {
  return {
    x: new Float64Array(4),
    P: new Float64Array(16),
    lastTimeMs: 0,
    initialised: false,
  };
}

/** Reset the filter (e.g. after a long gap in GPS data). */
export function resetEkf(state: EkfState): void {
  state.x.fill(0);
  state.P.fill(0);
  state.origin = undefined;
  state.initialised = false;
  state.lastTimeMs = 0;
}

/** Convert lat/lon to local ENU metres relative to an origin. */
function toEnu(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): { x: number; y: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = lat - originLat;
  const dLon = lon - originLon;
  // East axis: longitude difference scaled by cos(lat)
  const x = dLon * Math.cos(toRad(originLat)) * (Math.PI / 180) * EARTH_R;
  // North axis: latitude difference
  const y = dLat * (Math.PI / 180) * EARTH_R;
  return { x, y };
}

/** Convert local ENU metres back to lat/lon relative to an origin. */
function fromEnu(
  x: number,
  y: number,
  originLat: number,
  originLon: number,
): { lat: number; lon: number } {
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLat = y / (EARTH_R * (Math.PI / 180));
  const dLon = x / (Math.cos((originLat * Math.PI) / 180) * EARTH_R * (Math.PI / 180));
  return { lat: originLat + dLat, lon: originLon + dLon };
}

/** 4×4 matrix multiply (row-major). */
function mat4mul(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i * 4 + k] * b[k * 4 + j];
      }
      out[i * 4 + j] = sum;
    }
  }
  return out;
}

/** 4×4 matrix transpose. */
function mat4transpose(a: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] = a[j * 4 + i];
    }
  }
  return out;
}

/** Add two 4×4 matrices. */
function mat4add(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let i = 0; i < 16; i++) out[i] = a[i] + b[i];
  return out;
}

/**
 * Predict step — advance state by dt seconds using constant velocity model.
 * Updates state x and covariance P in place.
 */
function predict(state: EkfState, dt: number): void {
  // State transition: x' = F * x
  // F = [[1, 0, dt, 0],
  //      [0, 1, 0, dt],
  //      [0, 0, 1, 0],
  //      [0, 0, 0, 1]]
  const { x } = state;
  const dt2 = dt;
  x[0] += x[2] * dt2; // x += vx * dt
  x[1] += x[3] * dt2; // y += vy * dt
  // vx, vy unchanged

  // Covariance: P' = F * P * F^T + Q
  const F = new Float64Array([
    1, 0, dt, 0,
    0, 1, 0, dt,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  const FP = mat4mul(F, state.P);
  const Ft = mat4transpose(F);
  const FPFt = mat4mul(FP, Ft);

  // Process noise Q for constant-velocity model:
  // Q = σ_a² * [[dt⁴/4, 0, dt³/2, 0],
  //             [0, dt⁴/4, 0, dt³/2],
  //             [dt³/2, 0, dt², 0],
  //             [0, dt³/2, 0, dt²]]
  const dt3 = dt * dt * dt;
  const dt4 = dt3 * dt;
  const dt2sq = dt * dt;
  const sa2 = SIGMA_A * SIGMA_A;
  const Q = new Float64Array([
    sa2 * dt4 / 4, 0,             sa2 * dt3 / 2, 0,
    0,             sa2 * dt4 / 4, 0,             sa2 * dt3 / 2,
    sa2 * dt3 / 2, 0,             sa2 * dt2sq,   0,
    0,             sa2 * dt3 / 2, 0,             sa2 * dt2sq,
  ]);

  state.P = mat4add(FPFt, Q);
}

/**
 * Update step — fuse a GPS measurement into the state.
 * Standard Kalman update: K = P H^T (H P H^T + R)^-1, then x = x + K(z - Hx),
 * P = (I - K H) P.
 */
function update(state: EkfState, z: Float64Array, R: Float64Array): void {
  // Measurement matrix H = [[1,0,0,0],[0,1,0,0]] (we observe position only)
  // Innovation: y = z - H x
  const { x, P } = state;
  const y0 = z[0] - x[0];
  const y1 = z[1] - x[1];

  // S = H P H^T + R  (2×2)
  const S00 = P[0] + R[0];
  const S01 = P[1];
  const S10 = P[4];
  const S11 = P[5] + R[3];

  // K = P H^T S^-1  (4×2)
  // S^-1 = (1/det) [[S11, -S01], [-S10, S00]]
  const det = S00 * S11 - S01 * S10;
  if (Math.abs(det) < 1e-12) {
    // Singular — skip update
    return;
  }
  const invDet = 1 / det;
  const Sinv00 = S11 * invDet;
  const Sinv01 = -S01 * invDet;
  const Sinv10 = -S10 * invDet;
  const Sinv11 = S00 * invDet;

  // K = P H^T S^-1
  // P H^T = first 2 columns of P (4×2)
  const K = new Float64Array(8); // 4×2
  for (let i = 0; i < 4; i++) {
    const pi0 = P[i * 4];
    const pi1 = P[i * 4 + 1];
    K[i * 2] = pi0 * Sinv00 + pi1 * Sinv10;
    K[i * 2 + 1] = pi0 * Sinv01 + pi1 * Sinv11;
  }

  // x = x + K y
  x[0] += K[0] * y0 + K[1] * y1;
  x[1] += K[2] * y0 + K[3] * y1;
  x[2] += K[4] * y0 + K[5] * y1;
  x[3] += K[6] * y0 + K[7] * y1;

  // P = (I - K H) P
  // K H is 4×4 with K's two columns placed in cols 0 and 1
  const KH = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    KH[i * 4] = K[i * 2];
    KH[i * 4 + 1] = K[i * 2 + 1];
  }
  // I - KH
  const IKH = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const ident = i === j ? 1 : 0;
      IKH[i * 4 + j] = ident - KH[i * 4 + j];
    }
  }
  state.P = mat4mul(IKH, P);
}

/**
 * Process a new GPS fix through the EKF. Returns the smoothed estimate.
 *
 * Returns null if the fix is rejected (low accuracy, etc.).
 */
export function processGpsFix(state: EkfState, fix: GpsFix): EkfOutput | null {
  // Reject fixes with poor accuracy
  if (fix.accuracy > MAX_ACCURACY) return null;
  const effectiveAccuracy = Math.max(fix.accuracy, MIN_ACCURACY);

  if (!state.initialised) {
    // First fix — set origin, initialise state at this position with zero velocity
    state.origin = { lat: fix.lat, lon: fix.lon };
    state.x[0] = 0;
    state.x[1] = 0;
    state.x[2] = 0;
    state.x[3] = 0;
    // Initial covariance — high uncertainty in velocity (we don't know it yet)
    state.P.fill(0);
    state.P[0] = effectiveAccuracy * effectiveAccuracy; // x variance
    state.P[5] = effectiveAccuracy * effectiveAccuracy; // y variance
    state.P[10] = 100; // vx variance (m/s)² — large: unknown
    state.P[15] = 100; // vy variance
    state.lastTimeMs = fix.timestamp;
    state.initialised = true;

    return {
      lat: fix.lat,
      lon: fix.lon,
      speedMs: 0,
      headingDeg: NaN,
      accuracy: effectiveAccuracy,
      timestamp: fix.timestamp,
    };
  }

  // Predict
  const dt = (fix.timestamp - state.lastTimeMs) / 1000;
  if (dt < 0) {
    // Clock went backwards — reset
    resetEkf(state);
    return processGpsFix(state, fix);
  }
  if (dt > 0) {
    predict(state, dt);
  }

  // Convert GPS to ENU
  const enu = toEnu(fix.lat, fix.lon, state.origin!.lat, state.origin!.lon);

  // Measurement + measurement noise
  const z = new Float64Array([enu.x, enu.y]);
  const R = new Float64Array([
    effectiveAccuracy * effectiveAccuracy, 0,
    0, effectiveAccuracy * effectiveAccuracy,
  ]);

  // Update
  update(state, z, R);

  // If GPS provides a speed reading, nudge the velocity estimate toward it
  // (only if it's a valid number — phone GPS often returns NaN when stationary)
  if (fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0) {
    // Light update — bias the velocity magnitude toward GPS speed
    const ekfSpeed = Math.sqrt(state.x[2] ** 2 + state.x[3] ** 2);
    if (ekfSpeed > 0.5) {
      const ratio = fix.speed / ekfSpeed;
      // Damped update — 20% movement toward GPS speed
      const damped = 0.2 * ratio + 0.8;
      state.x[2] *= damped;
      state.x[3] *= damped;
    }
  }

  state.lastTimeMs = fix.timestamp;

  // Convert smoothed ENU back to lat/lon
  const smoothed = fromEnu(state.x[0], state.x[1], state.origin!.lat, state.origin!.lon);
  const speedMs = Math.sqrt(state.x[2] ** 2 + state.x[3] ** 2);
  const headingDeg = speedMs > 0.5
    ? (Math.atan2(state.x[2], state.x[3]) * 180) / Math.PI  // atan2(east, north)
    : NaN;
  const normalizedHeading = Number.isNaN(headingDeg)
    ? NaN
    : (headingDeg + 360) % 360;

  return {
    lat: smoothed.lat,
    lon: smoothed.lon,
    speedMs,
    headingDeg: normalizedHeading,
    accuracy: Math.sqrt(state.P[0] + state.P[5]), // combined position sigma
    timestamp: fix.timestamp,
  };
}
