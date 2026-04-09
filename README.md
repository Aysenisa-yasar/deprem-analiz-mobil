# DepremAnaliz

Turkiye icin modern mobil deprem risk izleme, son deprem haritasi, il bazli risk arama ve acil mesajlasma odakli tam yigin proje.

## Mevcut Durum

- Mobil uygulama: Expo + React Native + Expo Router
- Backend: Flask tabanli v2 API
- Kalici veri tabani: SQLite (`data/mobile_social.db`)
- Haritalar: siyah etiketli acik tema, kirmizi / sari / yesil risk vurgusu
- Il bazli risk arama: aktif
- Son deprem haritasi: aktif
- Offline mesaj kuyrugu: aktif
- Mesh, WhatsApp ve Twilio kalintilari: projeden temizlendi

## Dogrulanan Veri ve Model Durumu

- Yerel katalog: `earthquake_history.json`
- Normalize edilen olay sayisi: `26419`
- Risk kayitlari / cihaz verisi / mesajlasma verisi SQLite icinde kalici tutulur
- Son model metadata dosyasi: `models/forecast_latest.json`
- Model surumu: `forecast_20260405_161650154366`
- Egitim tarihi: `2026-04-05T16:16:50.154366Z`
- ROC-AUC ortalamasi: `0.663`
- PR-AUC ortalamasi: `0.295`
- Ornek sayisi: `26121`

Bu sistem resmi saniyeler-once deprem erken uyari altyapisinin yerine gecmez. Urettigi cikti, kisa vadeli bolgesel risk ve hazirlik sinyalidir.

## Mimari

- `app/`, `routes/`, `services/`: Flask API ve is kurallari
- `forecast/`: tahmin, ozellik cikarma, model saglik metrikleri
- `mobile/`: Android/iOS istemcisi
- `models/`: egitilmis model ve metadata
- `data/`: kalici uygulama verisi

## Yerel Calistirma

### Backend

```powershell
py -3.11 run.py
```

Varsayilan gelistirme adresi:

```text
http://127.0.0.1:5000
```

Android emulatorunde mobil uygulama bu adrese `10.0.2.2:5000` uzerinden baglanir.

### Mobil

```powershell
cd mobile
npm install
npx expo start --dev-client
```

Android icin hazir komut:

```powershell
cd mobile
.\start-android-dev-client.cmd
```

## Onemli API Uclari

- `GET /api/health`
- `GET /api/v2/forecast-map`
- `GET /api/v2/forecast-grid`
- `GET /api/v2/forecast-location`
- `GET /api/v2/recent-earthquakes`
- `GET /api/v2/forecast-model-status`
- `POST /api/mobile/register`
- `POST /api/mobile/login`
- `GET /api/mobile/me`
- `POST /api/mobile/messages`

## Kalite Notlari

- Mobil acilisinda API adresi erisilebilirlik testinden gecirilir.
- Ag hatalari kullaniciya ham `Network request failed` yerine anlamli mesaj olarak gosterilir.
- Forecast map ve grid ilk yanitta daha hizli calissin diye overview yolu optimize edildi.
- `data/mobile_social.db` cihaz tarafi sosyal/veri kayitlarini kalici olarak tutar.

## Test ve Dogrulama

Gecen dogrulamalar:

```powershell
cd mobile
npx tsc --noEmit
```

```powershell
$env:PYTHONPATH='C:\Users\LENOVO\OneDrive\Masaüstü\DepremAnaliz-main - Kopya;C:\Users\LENOVO\OneDrive\Masaüstü\DepremAnaliz-main - Kopya\.pydeps'
py -3.11 -m pytest -q tests/test_health_api.py tests/test_mobile_auth_api.py tests/test_forecast_api.py tests/test_admin_api.py
```

## Lisans

MIT
