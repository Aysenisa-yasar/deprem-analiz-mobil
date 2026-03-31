# DepremAnaliz

Hybrid spatio-temporal earthquake forecasting prototype for Turkey.

This project combines machine learning, ETAS-like scoring, clustering, b-value analysis, sequence heuristics, graph neural networks, explainability, and grid-based forecasting into a single research-oriented pipeline.

## What It Does

- Fuses seismic data from Kandilli, USGS, and optional AFAD sources
- Builds short-horizon earthquake risk forecasts over cities and geographic grid cells
- Uses a hybrid ensemble of XGBoost, ETAS-like scoring, cluster analysis, b-value risk, LSTM-style sequence signal, and optional GNN signal
- Computes SHAP-based local explanations and global feature importance
- Stores rolling evaluation, calibration, and backtest summaries for model inspection

## Current Forecast Stack

- Primary target: `m4_24h`
- Auxiliary targets: `m5_72h`, `max_mag_7d`
- Main model: calibrated XGBoost classifier
- Auxiliary models: calibrated XGBoost classifier + XGBoost regressor
- Spatial model: PyTorch Geometric based GNN
- Explainability: SHAP

## v2 API

- `GET /api/v2/forecast-map`
- `GET /api/v2/forecast-grid`
- `GET /api/v2/recent-earthquakes` (son depremler, mobil izleme)
- `GET /api/v2/forecast-metrics`
- `GET /api/v2/feature-importance`
- `POST /api/mobile/register` | `login` | `me` | `messages` | `emergency-contact` | `location-alert`

## Project Structure

```text
forecast/                  core forecasting pipeline
forecast/gnn/              graph dataset, model, trainer, predictor
services/                  application service layer
routes/                    Flask v2 routes + mobil API
mobile/                    Expo (React Native) uygulama
models/                    saved models
data/                      local data assets including fault geometry
app.py                     Flask app with legacy compatibility routes
```

## Installation

```bash
pip install -r requirements.txt
```

Optional GNN dependencies:

```bash
pip install torch torch-geometric
```

## Training

Train the hybrid forecast model:

```bash
python forecast/trainer.py
```

Train the optional GNN model:

```bash
python forecast/gnn/trainer.py
```

Run the application:

```bash
python app.py
```

Mobil istemci (Expo SDK 54):

```bash
cd mobile
npm install
npx expo start
```

`mobile/app.json` içindeki `extra.apiUrl` veya `EXPO_PUBLIC_API_URL` ile Flask sunucu adresini ayarlayın (ör. `http://192.168.1.x:5000`).

## Forecast Outputs

The saved forecast model includes:

- Time-series cross-validation metrics
- Calibration curve data
- Rolling backtest summary
- Global feature importance
- Auxiliary target configuration

City and grid forecast responses include:

- Final probability
- ML / ETAS / LSTM / cluster / b-risk / GNN components
- `m5_72h_probability`
- `max_mag_7d_prediction`
- `time_to_next_event_hours_prediction`
- `next_event_distance_km_prediction`
- `next_event_magnitude_prediction`
- `next_event_time_window`
- Fault proximity features
- SHAP top features for city-level explainable forecasts

## Toward Date-Specific Event Forecasting

If you want outputs closer to "the most likely next event is around this date, near this area, with this magnitude range", the project needs to move from pointwise risk scoring to calibrated spatio-temporal event forecasting.

The important scientific constraint is that this should still be treated as a probabilistic forecast, not a deterministic claim that a specific earthquake will definitely happen at an exact time and place.

### Recommended Upgrade Path

1. Redefine the targets
   - Keep the current `m4_24h` / `m5_72h` labels, but add event-level targets such as:
   - `time_to_next_event_hours`
   - `next_event_distance_km`
   - `next_event_magnitude`
   - grid-cell or fault-segment labels for the most likely next event location

2. Build a true spatio-temporal training set
   - Generate training examples for every forecast issue time and grid cell, not only for a single query point.
   - Keep strict chronological splits and rolling backtests to avoid leakage from the future.
   - Expand the historical catalog so rare larger events are represented better.

3. Predict distributions instead of exact point values
   - Add a survival / hazard model for event timing.
   - Add a spatial model over grid cells or fault segments.
   - Add quantile models for magnitude and lead time so the system can return uncertainty bands instead of false precision.

4. Add richer geophysical inputs
   - The current stack is mostly seismic-catalog driven.
   - To narrow time and location windows, add stronger physical signals when available:
   - fault geometry and slip-rate priors
   - GNSS / InSAR deformation proxies
   - station-level waveform summaries or swarm-quality indicators
   - catalog quality flags and completeness indicators

5. Change the API output format
   - Instead of a single risk score, return ranked scenarios:
   - top candidate cells / cities
   - most likely time window
   - likely magnitude interval
   - calibrated probability / uncertainty

6. Evaluate the right metrics
   - Keep ROC-AUC / PR-AUC / Brier for event occurrence.
   - Add event-aware metrics such as recall@top-k cells, lead-time error, calibration error, and interval coverage for time / magnitude forecasts.

### Repo Touch Points

The main implementation work in this repository would be:

- `forecast/multi_targets.py`: add next-event time, distance, magnitude, and location targets
- `forecast/trainer.py`: train timing + spatial + magnitude heads with time-series cross-validation
- `forecast/predictor.py`: return ranked event scenarios instead of only one local risk probability
- `services/forecast_service.py` and `services/grid_forecast_service.py`: expose scenario-oriented results
- `routes/forecast_routes.py` and `routes/metrics_routes.py`: publish new forecast and evaluation endpoints

## Research Directions

Planned or partially implemented upgrades:

- Real LSTM / GRU training instead of heuristic sequence scoring
- Stronger spatio-temporal GNN with richer node and edge features
- Survival / hazard modeling for time-to-next-event estimation
- Geodetic deformation inputs and richer physical priors
- Calibration plots and benchmarking figures
- Higher-resolution grid forecasting
- Paper-ready evaluation reports

## Important Note

This project is a research and engineering prototype. It does not provide deterministic earthquake prediction. Outputs should be interpreted as short-term probabilistic risk estimates, not official warnings.

For scientific context, see the U.S. Geological Survey FAQ on earthquake prediction and earthquake forecasting.

## License

MIT

## Local Model Backend (Windows)

Yerelde egitilmis modeli acmak icin:

```bat
launch_backend_model.cmd
```

Bu komut `models/forecast_latest.pkl` ile Flask backend'i baslatir.
Mobil gelistirmede `.env` icindeki `EXPO_PUBLIC_API_URL` degeri bu yerel backend'i gosterebilir.
