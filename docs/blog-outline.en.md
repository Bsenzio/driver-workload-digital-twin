# Building a Browser-Based Driving Workload Demo with Synthetic CAN

- **Motivation.** Explain the portfolio goal and why reproducible synthetic drives make the implementation inspectable.
- **Clock and scene.** Walk through the fixed 100 ms simulation, seeded noise, variable-rate playback and interpolation in the 3D camera.
- **Synthetic CAN design.** Show one signed field in hex, the frame cadences and what the rolling count includes.
- **Driver estimate and ECU model.** Open with the Highway Cruise diagnostic burst. Explain why frame processing raises the simulated CPU percentage independently of the driver estimate.
- **Comparing with the script.** Show the obstacle and explain the heuristic and scripted curves' different timing and shared scenario origin.
- **Limits and reproducibility.** Cover the absence of hardware and human validation, then download and inspect a telemetry CSV.

Figure: [Highway Cruise dashboard during diagnostics](demo.png).

Repository: [Driver Workload Digital Twin](https://github.com/bsenzio/driver-workload-digital-twin). [Live demo](https://bsenzio.github.io/driver-workload-digital-twin/).
