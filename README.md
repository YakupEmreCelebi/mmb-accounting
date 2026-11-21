# Mama's Burger Muhasebe

Tek şubeli bir fast food işletmesi için ön muhasebe uygulaması: gün sonu, giderler, cariler (tedarikçi / personel / yemek kartı), kasa ve hesaplar, kredi kartı ekstresi, restoran düzeninde kâr/zarar.

- **Çalıştığı yer:** iPad'de Safari → Paylaş → **Ana Ekrana Ekle**. Uygulama gibi tam ekran açılır, internetsiz çalışır.
- **Veriler:** yalnızca cihazın içinde (IndexedDB). Sunucu yok, ücret yok. Kod herkese açık olsa da veriler cihazdan çıkmaz.
- **Yedek:** Ayarlar → Yedekleme → “Yedeği kaydet” → Dosyalara Kaydet → iCloud Drive. Gün kapatılınca da yedek önerilir.

## Muhasebe modeli

Her işlem çift taraflı kayıttır (borç = alacak). Tutarlar kuruş cinsinden tam sayıdır.

| Ekran | Ne yapar |
|---|---|
| Gün sonu | Ödeme tiplerine göre satış, iade, kasa sayımı, kasa farkı; kapatılan günün kasa hareketleri kilitlenir |
| Gider | Ödendi (kasa / banka / kart) · Ödenecek (veresiye, vadeli) · Cepten ödendi (sahip / personel) |
| Personel | Maaş, avans, yevmiye, prim — kişi bazında |
| Cariler | Tedarikçi borçları (en eski borçtan düşen ödemeler), yemek kartı alacakları ve komisyon, işletme sahibi |
| Kredi kartı | Alım günü gider; ekstre ödemesi transfer (gider iki kez sayılmaz). “Ekstre ile doldur” satırları okur, elle girilenleri eşleştirir |
| Raporlar | Satış → malzeme → personel → prime cost → işletme giderleri → kâr; Excel'e aktarma |

## Güvenlik

- **Veriler yalnızca cihazda** (IndexedDB) durur. GitHub Pages'te sadece uygulamanın dosyaları vardır; uygulama başka hiçbir sunucuya veri göndermez. Adresi açan herkes kendi cihazında boş bir uygulama görür, başkasının verisine erişemez.
- **Uygulama şifresi (PIN):** cihazda geri çevrilemeyen SHA-256 özeti olarak saklanır, yedeğe konmaz. 5 yanlış denemeden sonra her yanlışta bekleme süresi uzar (30 sn → 15 dk); sayaç uygulama yeniden açılınca sıfırlanmaz. PIN girişi engeller, verileri şifrelemez; asıl koruma cihazın kendi şifresi / Face ID'sidir.
- **Şifreli yedek:** PBKDF2-SHA256 (600.000 tur, rastgele tuz) ile türetilen anahtarla AES-256-GCM. Parola yalnızca cihazda saklanır, yedek dosyasına konmaz; başka cihaza geri yüklerken sorulur. Yanlış parola veya değiştirilmiş dosya açılmaz.
- **Öneriler:** iPad'de şifre / Face ID ve otomatik kilit; GitHub ve Apple ID hesaplarında iki adımlı doğrulama; bu GitHub hesabından başka bir GitHub Pages sitesi yayınlamamak (aynı hesabın siteleri aynı adresi paylaşır).

## Geliştirme

```bash
npm install
npm run dev      # geliştirme sunucusu
npm test         # muhasebe çekirdeği testleri
npm run build    # üretim derlemesi (dist/)
```

`main` dalına her gönderimde GitHub Actions testleri çalıştırır ve GitHub Pages'e yayınlar (Settings → Pages → Source: GitHub Actions).
