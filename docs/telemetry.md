# Telemetry contract

Schema version **1**, simulator step **100 ms**, default seed **42**. All timestamps are relative to the session start. The initial state at 0 ms is visible and emits no frame or export row. A row at time `t` closes `(t − 100, t]`. The pseudorandom stream uses a 32-bit unsigned LCG. Replay speed controls the wall time needed to advance each fixed interval. Switching scenario or resetting reconstructs the seed, samples, counters and windows. A hidden tab and animation gaps over 250 ms add no simulated time.

## Signals and models

The script interpolates acceleration and steering profiles and adds small seeded perturbations. Speed integrates the requested acceleration, clamps to 0–180 km/h, then determines effective acceleration from the actual change in speed. Acceleration in the supplied scenarios is approximately −7.65 to +2.30 m/s², with clamping at rest. Throttle and brake are synthetic commands from 0–100%. Brake follows the requested deceleration, including near a full stop. Steering spans −85° to +85° and positive means right. Jerk and steering rate use the effective signal differences over 0.1 seconds, with zero derivatives at initialization. Distance uses trapezoidal speed integration.

**Driver demand estimate.** Normalize and clamp the following factors to 0–1 before the weighted sum.

| Factor | Normalization | Weight |
| --- | --- | --- |
| Brake | Brake percentage / 100 | 0.30 |
| Jerk | Absolute jerk / 8 m/s³ | 0.20 |
| Steering rate | Absolute rate / 120 °/s | 0.15 |
| Acceleration | Absolute acceleration / 6 m/s² | 0.10 |
| Hazard | Binary flag | 0.25 |

Multiply the sum by 100. The first completed step uses the raw value. Later steps use 0.30 × raw + 0.70 × previous index. At 0 ms the initial display uses the raw initial state. The weights and thresholds are illustrative.

**Simulated ECU CPU utilization.** Work in milliseconds per step is 12 + 2 × motion frames + 1 × pedal frames + 1 × hazard frames + 10 × diagnostic frames. Utilization is the work divided by the 100 ms budget, multiplied by 100 and capped at 100%. The toy model uses a single fictitious CPU and omits task scheduling and queues. Before the first completed interval, utilization has no reading.

**Synthetic reference (unvalidated).** Scenario-specific keyframes define an independent curve through linear interpolation. The scripts for the inputs and reference have a shared origin. Comparison shows how the estimate and reference differ in timing and magnitude for the supplied scripts.

The follow camera interpolates between completed poses, so its pose can trail telemetry by at most one step during playback. The track, vehicle attitude, braking lamps and obstacle position are illustrative rather than physical models.

## Synthetic CAN

Classic CAN teaching map. IDs are 11-bit, payloads are fixed length, offsets start at zero, multibyte fields are little-endian and unused bytes are zero.

| ID | Message | Cadence | DLC | Payload |
| --- | --- | --- | --- | --- |
| `0x120` | Vehicle motion | 100 ms | 8 | Offset 0 speed uint16 × 0.01 km/h, offset 2 acceleration int16 × 0.01 m/s², offset 4 steering int16 × 0.1°. |
| `0x121` | Pedals | 100 ms | 2 | Byte 0 throttle and byte 1 brake, uint8 with 1% resolution. |
| `0x122` | Hazard status | 200 ms | 1 | Byte 0 bit 0, where 1 means active. |
| `0x7A0` | Synthetic diagnostics | 20 ms during burst | 8 | Byte 0 is a session counter modulo 256, starting at 0. |

`src/sim/can.js` is the shared code definition. The encoder rounds to nearest with JavaScript's ties-toward-positive-infinity rule and clamps to the field range. The decoder rejects unknown IDs and DLC or payload lengths that disagree with the definition. Absolute cadence begins at each period after 0 ms. The diagnostic interval covers the five seconds following its 12.0 s marker and generates five frames per step at offsets 20, 40, 60, 80 and 100 ms. Ties sort by ascending numerical ID. The inspector displays newest frames first and keeps at most 100 frames before filtering. At time `t`, activity counts frames in `(max(0,t−1000),t]` and divides by `min(t,1000)/1000` seconds. At 0 ms the rate is displayed as zero. This is a frame rate with no physical bus occupancy or arbitration model.

## Telemetry CSV

UTF-8 with CRLF row endings, a decimal point and CSV quote escaping. Only completed samples of the current session are exported, oldest first. The filename includes the scenario ID and seed. Values use the precision below.

| Column | Meaning | Format |
| --- | --- | --- |
| `schema_version` | Telemetry contract version | Integer |
| `scenario_id` | Stable scenario slug | Text |
| `seed` | Unsigned PRNG seed | Integer |
| `sim_time_ms` | Step end, relative ms | Integer |
| `speed_kmh` | Vehicle speed, km/h | 3 decimals |
| `long_accel_mps2` | Effective longitudinal acceleration, m/s² | 3 decimals |
| `steer_deg` | Steering angle, degrees, positive right | 3 decimals |
| `throttle_pct` | Accelerator command, % | 3 decimals |
| `brake_pct` | Brake command, % | 3 decimals |
| `hazard_active` | Hazard present | 0 or 1 |
| `jerk_mps3` | Change in longitudinal acceleration, m/s³ | 3 decimals |
| `steer_rate_deg_s` | Steering rate, °/s | 3 decimals |
| `driver_demand_index` | Smoothed heuristic, 0–100 | 3 decimals |
| `synthetic_reference_index` | Scripted reference, 0–100 | 3 decimals |
| `cpu_demand_ms` | Synthetic work demand, ms per step | Integer |
| `ecu_cpu_sim_pct` | Simulated utilization, % | Integer |
| `can_frames_in_step` | Frames in the completed interval | Integer |
| `can_frames_per_s` | Rolling frame rate, frames/s | 3 decimals |
| `event_ids` | Active scenario event IDs | Pipe-separated text or blank |
