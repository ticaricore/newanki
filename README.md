# NewAnki

Mobil öncelikli aralıklı tekrar (SRS) PWA'sı. Go + SQLite arka uç, React + TypeScript + Tailwind + TanStack ön uç; hepsi tek bir binary içinde.

## Mimari

- `server/` — Go API (`/api/v1`) ve gömülü PWA.
  - `data/main.db`: kullanıcılar, oturumlar, genel ayarlar, denetim kaydı.
  - `data/users/<user_uid>.db`: her kullanıcının desteleri, kartları, tekrar geçmişi, ayarları (kullanıcı başına ayrı SQLite dosyası).
  - `data/users/<user_uid>/media/`: yüklenen görsel ve ses dosyaları.
  - İç anahtarlar `INTEGER PRIMARY KEY`, dışarıya yalnızca `uid` (UUIDv7) açılır.
- `web/` — Vite + React 19 + TS, Tailwind v4, TanStack Router/Query/Form, Vaul, vite-plugin-pwa.

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
