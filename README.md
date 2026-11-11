# Driver Workload Digital Twin

A browser-based driving simulation with a 3D follow camera and cabin inset, synthetic CAN telemetry, a driver-demand heuristic, and a separate simulated ECU CPU budget. An interactive classifier lab fits three models from labeled synthetic CSV data.

[Open the live demo](https://bsenzio.github.io/driver-workload-digital-twin/)

![The merging vehicle detected by a front radar while the sensor overlay is active](docs/cut-in.png)

## Run locally

Use Node.js 24 LTS and npm. From a checkout:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open the project URL printed by Vite. The production project base is `/driver-workload-digital-twin/`.

## Five drives, one simulation clock

| Scenario | Duration | What to watch |
| --- | --- | --- |
| **Highway Cruise** | 36 s | From 12–17 s, diagnostic frames raise modeled ECU utilization from about 27–31% to 77–81% with sensor transport enabled, while cruise and the driver estimate stay steady. |
| **Urban Stop-and-Go** | 40 s | Two stops and a right turn shift the braking and steering inputs. |
| **Sudden Hazard** | 34 s | A barricade appears at 12 s. Compare the elevation and recovery of the estimated and reference curves. |
| **Vehicle Cut-In** | 38 s | A car approaches from the left and merges ahead. Watch the target enter the radar and camera sectors, then try a degraded sensor stream. |
| **City Intersections** | 44 s | Stop at Market Street and Civic Avenue while cars cross in both directions. Watch the signals, stop lines and cabin response. |

[Open City Intersections directly](https://bsenzio.github.io/driver-workload-digital-twin/?scenario=city-intersections) and press **Play**.

![The simulated car waiting at a red signal while cross traffic passes at Market Street](docs/city.png)

Choose a scenario and play at 0.5×, 1× or 2×. Pause to inspect the newest CAN frames, filter by ID, and download the captured CSV. Reset or change scenario to start a new session. Each replay with the same scenario, schema version, seed and sensor configuration produces the same samples and frame bytes across playback rates.

## Cabin camera and scripted traffic

The cabin inset shows a procedural driver avatar from the passenger side. A passing vehicle, an urban lead car and oncoming traffic, a vehicle alongside the obstacle scene, and two signalized intersections give the avatar context. Its posture follows rules for nearby traffic, steering, braking and recovery. The status strip names the rule and its trigger. These are scripted responses. The prototype uses no camera feed, gaze tracking, or human measurements.

In **City Intersections**, the signals, traffic lanes and avatar share the simulation clock. The car waits before each crosswalk. Opposing traffic also waits on the main road while vehicles traverse the cross street. The CSV records the amber, red and green events in its existing `event_ids` column.

## Sensor instrumentation

[Open Vehicle Cut-In](https://bsenzio.github.io/driver-workload-digital-twin/?scenario=vehicle-cut-in) and use the sensor panel below the vehicle. Click a marker on the 3D car or the schematic map to inspect wheel speed, IMU, steering, pedals, brake pressure, radar or camera signals. The panel shows simulated truth, a paired healthy baseline, delivered measurements and sample age.

Choose one sensor and inject added noise, a 300 ms delay or 40% sample loss, then press **Apply & restart**. Both streams use the same drive and baseline random seed. The graph and sensor CSV expose the change in the measured signals. Sensor messages flow through the CAN inspector and their processing costs contribute to the simulated ECU budget.

Three additional models classify signal quality from 2 s windows. Their evaluation uses held-out episodes and features derived from the simulator's known truth and sample timestamps. Download the labeled quality dataset to inspect the training inputs. See the [sensor definitions, fault model, CAN map and CSV contract](docs/sensors.md).

## CAN traffic classifier lab

Open the lab to train a decision tree, Gaussian naive Bayes and 7-nearest neighbors. The generated CSV contains 360 labeled one-second windows. Whole episodes stay together in the training or test set. Download or import a compatible labeled CSV, toggle signal groups, and compare held-out accuracy and confusion matrices. Try the presets, edit rates and driving signals, or copy the latest second of a replay into the lab as an unlabeled probe.

The default dataset is synthetic. With all feature groups selected, the tree correctly classified 95% of the held-out windows. With only aggregate rate and driving signals, it classified 27.5%. Multiple frame families can raise the total rate by the same amount, which makes the per-ID counts valuable for this experiment.

See the [lab guide and CSV schema](docs/classifier-lab.md) for how the bursts, labels and splits are generated.

## How it fits together

- `src/sim/` implements scenario scripts, a fixed 100 ms clock, seeded signals, a shared CAN codec, the demand heuristic, ECU processing costs and CSV serialization in JavaScript independent of the DOM or renderer.
- `src/scene/` renders a local GLB with Three.js. A procedural vehicle handles model load failure. A static illustration handles unavailable WebGL.
- `src/ml/` generates labeled windows, validates CSV data and fits the three classifiers from scratch.
- `src/ui/` and `src/main.js` present the synchronized charts, cabin cues, frame inspector and interactive lab.
- `tests/` verifies replay determinism, clock behavior, CAN bytes and timing, signal limits, diagnostic independence and the CSV contract.

See the [telemetry contract](docs/telemetry.md) for formulas, units, CAN IDs and binary fields, and the CSV schema. See the [asset notes](docs/assets.md) for origins and regeneration. Original code and assets use the [MIT License](LICENSE).

## Interview walkthrough · 75 seconds

1. **0–25 s · Highway Cruise.** Press Play at 2× and pause just after 12 seconds. Point out the 0x7A0 frames and the ECU utilization jump, then compare the steady speed and low driver-demand estimate.
2. **25–55 s · Sudden Hazard.** Select the scenario and replay at 2×. When the barricade appears, point to the brake lights, the solid estimate and the dashed reference. Explain how the heuristic and scripted keyframes produce different magnitudes and recovery curves.
3. **55–75 s · Inspect and export.** Pause and open the frame inspector to explain one signed acceleration value. Download the CSV and point to the simulation timestamps, event IDs and distinct driver and ECU columns.

After the walkthrough, use **Use current replay window** in the lab to classify a live sample. Switch off per-ID counts and retrain to compare how much the classifiers can infer with fewer inputs.

## Scope and limitations

“Digital twin” is the project name for a simulation prototype with no physical vehicle connection. All data and CAN identifiers are synthetic. The demand index is an illustrative heuristic with no machine learning, human measurement, safety rating or empirical validation. “Synthetic ground truth” refers to the scenario's unvalidated scripted reference. Its shared origin with the input script limits the comparison to the simulated scenarios. The ECU budget is a separate fictional model. The 3D track and obstacle illustrate the scenario rather than model road or vehicle dynamics.

This independent portfolio project has no affiliation with, endorsement from, or participation by Toyota or Woven by Toyota.
