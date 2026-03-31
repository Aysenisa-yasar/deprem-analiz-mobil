# GitHub + Render: adım adım

Bu rehber Flask arka ucunu (`app.py`) Render’da çalıştırır; Expo mobil uygulama `mobile/app.json` içindeki API adresini buna yönlendirir.

## Veritabanı ne kullanılacak?

| Amaç | Şu anki kod | Render’da öneri |
|------|-------------|-----------------|
| **Mobil kullanıcı, mesaj, acil kişi** | SQLite → `data/mobile_social.db` | **Ücretsiz + disk yok:** veri genelde instance dosya sisteminde tutulur; **yeniden deploy** ile sıfırlanabilir. **Üretim:** **Persistent Disk** + `DATA_DIR=/data` (mount path ile aynı). |
| **Deprem arşivi (opsiyonel)** | `DATABASE_URL` varsa PostgreSQL (`db_store.py`) | Render’da **PostgreSQL** oluşturup `DATABASE_URL` ekleyin. `psycopg2-binary` `requirements.txt` içinde. |

Özet: **İki ayrı ihtiyaç** — (1) mobil sosyal veri = SQLite + mümkünse disk, (2) büyük deprem kataloğu = PostgreSQL isteğe bağlı.

---

## 1. GitHub’da yeni repo

1. [github.com/new](https://github.com/new) → Repository adı (örn. `depremanaliz-api`).
2. Public/Private seçin, README eklemeden oluşturabilirsiniz.
3. Bilgisayarınızda proje klasöründe:

```bash
git remote remove origin
git remote add origin https://github.com/KULLANICI/depremanaliz-api.git
git branch -M main
git add .
git commit -m "Render için API"
git push -u origin main
```

(`origin` zaten varsa URL’yi güncelleyin: `git remote set-url origin ...`)

---

## 2. Render hesabı ve Web Service

1. [render.com](https://render.com) → GitHub ile giriş, repoya erişim verin.
2. **New +** → **Web Service** → GitHub’dan bu repoyu seçin.
3. Ayarlar:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120 --workers 1`
   - **Instance type:** Free (veya ücretli)

4. **Environment** (gerekirse):
   - `PYTHON_VERSION` = `3.11.0` (veya Render varsayılanı)
   - İleride PostgreSQL kullanacaksanız: `DATABASE_URL` = Render Postgres’in **Internal Database URL** değeri

5. **Kalıcı mobil veri (isteğe bağlı, ücretli disk):**  
   Servis → **Disks** → Add disk → Mount path örn. `/data`  
   Sonra **Environment** → `DATA_DIR` = `/data`

6. **Create Web Service** → Derleme bitince URL: `https://xxx.onrender.com`

7. Sağlık kontrolü: tarayıcıda `https://xxx.onrender.com/api/health`

---

## 3. Expo mobil uygulama

1. `mobile/app.json` → `extra.apiUrl` değerini `https://xxx.onrender.com` yapın (sonunda `/` olmasın).
2. Veya Ayarlar ekranından aynı adresi girin.
3. Render **free** plan ilk istekte uyanır; ilk açılış 30–60 sn sürebilir.

---

## 4. Sık sorunlar

- **CORS:** `app.py` içinde `/api/*` için zaten açık.
- **Soğuma (cold start):** Ücretsiz servis uyku modunda; ilk API çağrısı gecikebilir.
- **Worker sayısı:** SQLite mobil DB kullanıyorsanız `workers 1` tutun (dosya kilidi).

---

## 5. Blueprint ile oluşturma

Repodaki `render.yaml` dosyasını Render’da **Blueprints** ile içe aktarabilirsiniz; ardından disk ve `DATABASE_URL` gibi değerleri dashboard’dan tamamlayın.

## 6. Modelli deploy icin kritik not

Bu repoda Render build'i artik `scripts/verify_render_assets.py` calistirir.
Build'in basarili olmasi icin su iki dosyanin GitHub'a push edilmis olmasi gerekir:

- `models/forecast_latest.pkl`
- `earthquake_history.json`

Bu dosyalar artik `.gitignore` icinde istisna olarak acildi. Yani `git add .` sonrasi deploy'a dahil olabilirler.

Mobil uygulama tarafinda:

- gelistirmede `.env` icindeki `EXPO_PUBLIC_API_URL` onceliklidir
- deploy/default durumda `mobile/app.json > expo.extra.apiUrl` kullanilir

Boylece yerelde model backend ile calisabilir, Render deploy'unda ise uzak URL otomatik kullanilir.
