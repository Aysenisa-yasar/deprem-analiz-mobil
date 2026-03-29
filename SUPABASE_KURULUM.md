# Supabase Kurulum Adimlari

Bu repo icin Supabase baglantisini guvenli sekilde hazirlamak icin asagidaki sirayi kullan.

## 1. Local env dosyalari

Root klasorde:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres
OPENAI_API_KEY=your_openai_api_key_here
```

`mobile/.env` icinde:

```env
EXPO_PUBLIC_API_URL=https://your-backend-url.example.com
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Hazir ornekler:

- `.env.example`
- `mobile/.env.example`

## 2. Supabase Dashboard sonraki tiklar

1. Proje ana ekranina don.
2. Sol menuden `Authentication` ikonuna gir.
3. `URL Configuration` ekranini ac.
4. `Redirect URLs` listesine `mobile://**` ekle.

Bu repo zaten `mobile/app.json` icinde `scheme: "mobile"` kullaniyor. Supabase'in native mobile deep linking dokumanina gore custom scheme ile `scheme://**` redirect tanimlamak gerekiyor:

- [Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## 3. Auth provider sirasi

En risksiz siralama:

1. `Email`
2. `Google`
3. `Phone OTP`

`Phone OTP` icin Supabase'e gore bir SMS provider gerekir:

- [Phone Login](https://supabase.com/docs/guides/auth/phone-login)

`Google` icin provider ayari ve callback URL gerekir:

- [Auth Google Login](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 3.1 E-posta ile 6 haneli kod gondermek

Supabase dokumanina gore email OTP ve magic link ayni altyapiyi kullanir. E-posta icin link yerine 6 haneli kod gondermek istiyorsan `Magic Link` email template icinde `{{ .ConfirmationURL }}` yerine `{{ .Token }}` kullanmalisin:

- [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

Ornek icerik:

```html
<h2>DepremAnaliz giris kodun</h2>
<p>Uygulamaya giris veya kayit icin bu kodu kullan:</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
```

## 4. Guvenlik notu

Bu kurulumda `publishable key` mobil uygulamada kullanilabilir. Ama `service_role key`, database password ve OAuth client secret kesinlikle repoya yazilmaz.

Eger bir secret sohbet veya ekran goruntusunda gorundu ise yenile:

1. OAuth app secret
2. Gerekirse database password
3. Gerekirse service role key

## 5. CLI ne zaman lazim

Su komutlar daha sonra migration ve schema esleme asamasinda lazim olur:

```bash
supabase login
supabase init
supabase link --project-ref your-project-ref
```

Su an zorunlu degil; once dashboard auth ve env kurulumunu netlestiriyoruz.
