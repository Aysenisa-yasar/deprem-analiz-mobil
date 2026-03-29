# Offline Mesh Haberlesme

## Net durum

Internet ve GSM operatoru olmadan iki telefonun sadece mobil uygulama ile haberlesmesi mumkun, ama bu mevcut `Expo Go + HTTP API` yapisiyla olmaz. Yerel radyo tabanli bir katman gerekir:

- Android: `Nearby Connections`
- iPhone: `MultipeerConnectivity`

Bu resmi teknolojiler internetsiz yakindaki cihazlarla veri degisimi icin kullanilir:

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Google Nearby Connections overview](https://developers.google.com/nearby/connections/overview)
- [Apple MultipeerConnectivity](https://developer.apple.com/documentation/multipeerconnectivity)

## Bu repoda su an ne eklendi

Bu turda iki katman birden eklendi:

- kayip veri olmamasi icin `offline queue`
- Android-first deneysel `yakın cihaz / mesh ekranı`

Eklenenler:

- mesajlar icin `offline queue`
- acil durum kartlari icin `offline queue`
- baglanti gelince `tekrar gonder`
- `expo-nearby-connections` tabanli yakin cihaz kesfi
- baglanti istegi kabul / red
- yakin cihaza kisa metin gonderme
- bagli cihazlara tek dokunus SOS gonderme

Kod:

- `mobile/lib/offlineRelay.ts`
- `mobile/lib/mesh.native.ts`
- `mobile/lib/mesh.web.ts`
- `mobile/lib/mesh.ts`
- `mobile/app/(tabs)/mesh.tsx`
- `mobile/app/(tabs)/messages.tsx`
- `mobile/app/(tabs)/emergency.tsx`
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/app.json`
- `mobile/eas.json`

## Neden hemen tam mesh yapmadik

Mevcut mobil uygulama Expo tabanli ve su an `Expo Go` mantiginda gelisiyor. Gercek cihazdan cihaza, operatorsuz haberlesme icin custom native moduller gerekiyor. Expo'nun resmi development build akisi bunun icin gerekli:

- [Development builds introduction](https://docs.expo.dev/develop/development-builds/introduction/)

## Gercek deneme plani

### Faz 1

Zaten eklendi:

- internet yokken mesaj kaybolmasin
- cihazda kuyruklansin
- ag gelince tekrar gonderilsin

### Faz 2

Android-first mesh prototipi:

1. `Nearby Connections` tabanli yerel kesif
2. yakin cihazlari bulma
3. baglanti istegi
4. kisa metin ve SOS gonderme

Bu faz artik repo icinde deneysel olarak var.

### Faz 3

iPhone destegi:

1. `MultipeerConnectivity`
2. ayni paket yapisi
3. ortak JS arayuzu

## Pratik sonuc

Bugun hemen deneyebilecegimiz sey:

1. telefonu ucak moduna al
2. iki Android telefona ayni development build'i kur
3. iki cihazda `Yakin Ag / Mesh` ekranini ac
4. `Agi baslat` ile yakin kesfi ac
5. bir cihaz digerini gorunce `Baglan` de
6. diger cihaz `Kabul` desin
7. internetsiz kisa metin veya SOS gonder

Ek not:

- Bu akisin Expo Go ile calismasi beklenmez.
- Android ve iPhone arasinda capraz mesh bu pakette desteklenmiyor.
