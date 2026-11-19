# NewAnki

Mobil öncelikli aralıklı tekrar (SRS) PWA'sı. Go + SQLite arka uç, React + TypeScript + Tailwind + TanStack ön uç; hepsi tek bir binary içinde.

## Mimari

- `server/` — Go API (`/api/v1`) ve gömülü PWA.
  - `data/main.db`: kullanıcılar, oturumlar, genel ayarlar, denetim kaydı.
  - `data/users/<user_uid>.db`: her kullanıcının desteleri, kartları, tekrar geçmişi, ayarları (kullanıcı başına ayrı SQLite dosyası).
  - `data/users/<user_uid>/media/`: yüklenen görsel ve ses dosyaları.
  - İç anahtarlar `INTEGER PRIMARY KEY`, dışarıya yalnızca `uid` (UUIDv7) açılır.
- `web/` — Vite + React 19 + TS, Tailwind v4, TanStack Router/Query/Form, Vaul, vite-plugin-pwa.

## Çevrimdışı çalışma

- Uygulama kabuğu service worker ile önbellekte; bağlantı yokken de açılır.
- Giriş yapılınca önümüzdeki 3 günün kartları (ve görsel/ses dosyaları) IndexedDB'ye indirilir. Bugün, Desteler ve İlerleme ekranları son görülen veriyle açılır.
- Her cevap önce cihazdaki kuyruğa (outbox) yazılır, sonra `POST /api/v1/reviews/batch` ile gönderilir. Bağlantı yoksa bekler; bağlantı gelince, uygulama açılınca veya en geç bir dakika içinde gönderilir.
- Sunucu cevapları gerçek cevap zamanına (`client_ts`, en fazla 30 gün geriye) göre sıralayıp uygular. Aynı cevap iki kez sayılmaz. Başka cihazda daha yeni bir tekrar varsa eski cevap kayda geçer ama kartı geri almaz.
- Kart/deste oluşturma ve arama bağlantı gerektirir.

## AI ile kart üretme

- Sunucuyu `ANTHROPIC_API_KEY` ortam değişkeniyle başlatınca açılır (anahtar yalnızca sunucuda durur, tarayıcıya gitmez). Model varsayılan olarak `claude-opus-5-5`; `NEWANKI_AI_MODEL` ile değiştirilebilir.
- **Tek kelime:** anlam, IPA, tür, örnek cümle ve çevirisi, eş anlamlılar önerilir; düzenleyip "Karta dönüştür" ile desteye eklenir.
- **Konu veya metin:** 5–30 kelime kartı önerilir. Destede zaten olan kelimeler isteğe eklenir ve tekrar önerilmez; destelerde bulunanlar "zaten var" diye işaretlenir.
- Yönetim panelinden açılıp kapatılabilir ve kullanıcı başına günlük istek sınırı (varsayılan 30) ayarlanır. Panel o günkü istek, kart ve token sayısını gösterir.
- Güvenlik sınıflandırıcısının reddettiği istekler sunucu tarafı yedek modelle (`fallbacks: "default"`) tekrar denenir.

```bash
ANTHROPIC_API_KEY=sk-ant-... make dev
```

## Geliştirme

```bash
make dev
```

- API: http://127.0.0.1:8080, arayüz: http://localhost:5174
- İlk açılışta admin oluşturulur: `admin@newanki.local` / `Admin123!` (ilk girişte şifre değiştirmek zorunludur). `NEWANKI_ADMIN_EMAIL` / `NEWANKI_ADMIN_PASSWORD` ile değiştirilebilir.
- `-dev` modunda tasarımdaki desteler ve kartlarla bir demo kullanıcı oluşturulur: `demo@newanki.local` / `Demo1234!`

Sorgu veya API tipi değiştiğinde:

```bash
make gen
```

## Test

```bash
make test
```

## Üretim

```bash
make build
```

`bin/newanki` tek binary'dir (CGO yok). Çalıştırmak için:

```bash
./bin/newanki serve -data /var/lib/newanki -addr :8080
```

HTTPS arkasında çalıştırın (oturum çerezi varsayılan olarak `Secure`). Ters vekil kullanıyorsanız `-trust-proxy` ekleyin.

Diğer komutlar:

- `newanki migrate -data …` — tüm kullanıcı veritabanlarını güncel şemaya taşır (normalde açılışta otomatik yapılır).
- `newanki admin reset-password -email x -data …` — şifre sıfırlar; kullanıcı ilk girişte değiştirir.
