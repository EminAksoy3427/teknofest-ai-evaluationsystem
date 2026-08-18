# Yerel Google OAuth Kurulumu

Bu belge yalnız yerel geliştirici kurulumu içindir. Production callback veya credential
oluşturmaz.

1. Google Cloud Console'da bir proje oluşturun veya mevcut geliştirme projesini seçin.
2. OAuth consent screen/branding bilgilerini Google'ın istediği şekilde yapılandırın.
3. Credentials bölümünde bir OAuth Client ID oluşturun.
4. Application type olarak **Web application** seçin.
5. Authorized redirect URI listesine tam olarak şunu ekleyin:

   ```text
   http://localhost:5173/api/auth/callback/google
   ```

6. Client ID ve Client Secret değerlerini alın; kaynak koda yazmayın.
7. `apps/web/.dev.vars.example` dosyasını `apps/web/.dev.vars` olarak kopyalayın ve
   `GOOGLE_CLIENT_ID` ile `GOOGLE_CLIENT_SECRET` değerlerini yalnız bu gitignored dosyada girin.
8. En az 32 baytlık güçlü bir Better Auth sırrı üretin (örneğin `openssl rand -base64 32`) ve
   `BETTER_AUTH_SECRET` olarak girin.
9. `BETTER_AUTH_URL=http://localhost:5173` değerini aynen kullanın.
10. Yerel geliştirme sunucusunu yeniden başlatın.
11. “Google ile giriş yap” düğmesiyle giriş, callback, oturum görünümü ve çıkış smoke testini
    tamamlayın.

Yerel origin `http://localhost:5173`, callback ise
`http://localhost:5173/api/auth/callback/google` değeridir. Gelecekteki production origin ve
callback ayrı, açıkça yetkilendirilmiş bir deployment görevinde tanımlanmalıdır; yerel callback
production için kullanılmaz.
