import type { MembershipSummary } from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ROLE_LABELS } from "./profile-memberships";
import {
  AccountSection,
  accountSectionFromHash,
  accountSectionPath,
  MembershipSection,
  ProfilePage,
  ProfileSection,
  SecuritySection,
} from "./profile-page";

vi.mock("./auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: {
          id: "user-self",
          name: "Ayşe Yılmaz",
          email: "ayse@example.com",
          image: "https://example.com/photo.png",
        },
      },
    }),
    updateUser: vi.fn(),
    getSession: vi.fn(),
    listAccounts: vi.fn(async () => ({ data: [{ providerId: "google" }] })),
    changePassword: vi.fn(),
    signOut: vi.fn(),
  },
}));

const memberships = [
  {
    competitionId: "comp-a",
    competitionName: "Sürdürülebilir Teknolojiler 2026",
    competitionSlug: "surdurulebilir-2026",
    role: "COMPETITION_MANAGER",
  },
  {
    competitionId: "comp-b",
    competitionName: "Aqua Challenge",
    competitionSlug: "aqua-challenge",
    role: "EVALUATION_MANAGER",
  },
  {
    competitionId: "comp-c",
    competitionName: "İklim Hackathonu",
    competitionSlug: "iklim-hackathonu",
    role: "REVIEWER",
  },
  {
    competitionId: "comp-d",
    competitionName: "Deniz Teknolojileri",
    competitionSlug: "deniz-teknolojileri",
    role: "CONTESTANT",
  },
] satisfies MembershipSummary[];

vi.mock("./app-shell", () => ({
  useMemberships: () => ({
    memberships: [
      {
        competitionId: "comp-a",
        competitionName: "Sürdürülebilir Teknolojiler 2026",
        competitionSlug: "surdurulebilir-2026",
        role: "COMPETITION_MANAGER",
      },
      {
        competitionId: "comp-b",
        competitionName: "Aqua Challenge",
        competitionSlug: "aqua-challenge",
        role: "EVALUATION_MANAGER",
      },
      {
        competitionId: "comp-c",
        competitionName: "İklim Hackathonu",
        competitionSlug: "iklim-hackathonu",
        role: "REVIEWER",
      },
      {
        competitionId: "comp-d",
        competitionName: "Deniz Teknolojileri",
        competitionSlug: "deniz-teknolojileri",
        role: "CONTESTANT",
      },
    ],
    error: null,
    refresh: () => undefined,
  }),
}));

function renderProfile(path = "/app/profile") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe("account section routing", () => {
  it("maps canonical hashes, aliases and empty hash to a single section", () => {
    expect(accountSectionFromHash("")).toBe("profile");
    expect(accountSectionFromHash("#profile")).toBe("profile");
    expect(accountSectionFromHash("#profil")).toBe("profile");
    expect(accountSectionFromHash("#security")).toBe("security");
    expect(accountSectionFromHash("#guvenlik")).toBe("security");
    expect(accountSectionFromHash("#roles")).toBe("roles");
    expect(accountSectionFromHash("#roller")).toBe("roles");
    expect(accountSectionFromHash("#account")).toBe("account");
    expect(accountSectionFromHash("#hesap")).toBe("account");
    expect(accountSectionFromHash("#unknown")).toBe("profile");
    expect(accountSectionPath("profile")).toBe("/app/profile");
    expect(accountSectionPath("roles")).toBe("/app/profile#roles");
  });
});

describe("account center information architecture", () => {
  it("renders only the profile section on /app/profile", () => {
    const markup = renderProfile();
    expect(markup).toContain("Hesap ayarları");
    expect(markup).toContain("Profil bilgileri");
    expect(markup).toContain("Görünen ad");
    expect(markup).toContain("Değişiklikleri kaydet");
    expect(markup).not.toContain("Hesabınıza bağlı giriş yöntemlerini");
    expect(markup).not.toContain("bu ekrandan değiştirilemez");
    expect(markup).not.toContain("Hesap kimliği");
    expect(markup).not.toContain("Mevcut şifre");
  });

  it("opens only the roles section from the #roles deep link", () => {
    const markup = renderProfile("/app/profile#roles");
    expect(markup).toContain("Roller yarışma kapsamında atanır ve bu ekrandan değiştirilemez.");
    expect(markup).toContain(ROLE_LABELS.COMPETITION_MANAGER);
    expect(markup).not.toContain("Profil bilgileri");
    expect(markup).not.toContain("Değişiklikleri kaydet");
    expect(markup).not.toContain("Hesabınıza bağlı giriş yöntemlerini");
    expect(markup).not.toContain("Hesap kimliği");
  });

  it("opens only the security section from the #security deep link", () => {
    const markup = renderProfile("/app/profile#security");
    expect(markup).toContain("Hesabınıza bağlı giriş yöntemlerini");
    expect(markup).toContain("Google");
    expect(markup).not.toContain("Profil bilgileri");
    expect(markup).not.toContain("Görünen ad");
    expect(markup).not.toContain("bu ekrandan değiştirilemez");
    expect(markup).not.toContain("Hesap kimliği");
  });

  it("opens only the account section from the #account deep link", () => {
    const markup = renderProfile("/app/profile#account");
    expect(markup).toContain("Hesap kimliği");
    expect(markup).toContain("Bu cihazdaki oturumu sonlandırın.");
    expect(markup).toContain("Çıkış yap");
    expect(markup).not.toContain("Profil bilgileri");
    expect(markup).not.toContain("Görünen ad");
    expect(markup).not.toContain("Hesabınıza bağlı giriş yöntemlerini");
    expect(markup).not.toContain("bu ekrandan değiştirilemez");
  });

  it("keeps a compact mobile section navigator in the markup", () => {
    const markup = renderProfile();
    expect(markup).toContain("account-nav");
    expect(markup).toContain("account-nav-label-short");
    expect(markup).toContain(">Roller<");
    expect(markup).toContain('href="/app/profile"');
    expect(markup).toContain('href="/app/profile#security"');
    expect(markup).toContain('href="/app/profile#roles"');
    expect(markup).toContain('href="/app/profile#account"');
  });
});

describe("profile identity", () => {
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <ProfileSection
        email="ayse@example.com"
        hasGoogle
        image="https://example.com/photo.png"
        name="Ayşe Yılmaz"
      />
    </MemoryRouter>,
  );

  it("lets the current user edit name and shows email as a read-only field", () => {
    expect(markup).toContain("Profil bilgileri");
    expect(markup).toContain("Ayşe Yılmaz");
    expect(markup).toContain("ayse@example.com");
    expect(markup).toContain("Görünen ad");
    expect(markup).toContain("Değişiklikleri kaydet");
    expect(markup).toContain('name="name"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("Google hesabınızdan gelir");
    expect(markup).toContain("field-static");
    expect(markup).not.toContain('name="email"');
    expect(markup).not.toContain('type="email"');
    expect(markup).not.toContain("E-postayı değiştir");
    expect(markup).not.toContain("Telefon");
  });
});

describe("security UI", () => {
  it("shows a current-password form only for credential accounts", () => {
    const credential = renderToStaticMarkup(
      <SecuritySection accountsLoaded hasCredential hasGoogle={false} />,
    );
    expect(credential).toContain("Mevcut şifre");
    expect(credential).toContain("Yeni şifre");
    expect(credential).toContain("Yeni şifreyi doğrula");
    expect(credential).toContain("Diğer oturumları kapat");
    expect(credential).toContain("E-posta ve şifre");
    expect(credential).toContain("Bağlı");
    expect(credential).toContain("Şifreyi değiştir");
    expect(credential).not.toContain("setPassword");

    const googleOnly = renderToStaticMarkup(
      <SecuritySection accountsLoaded hasCredential={false} hasGoogle />,
    );
    expect(googleOnly).toContain("Bu hesap için parola girişi kullanılmıyor.");
    expect(googleOnly).toContain("Bağlı değil");
    expect(googleOnly).not.toContain("Mevcut şifre");
    expect(googleOnly).not.toContain("Şifreyi değiştir");
    expect(googleOnly).not.toContain("İki faktörlü");
    expect(googleOnly).not.toContain("Telefon");
  });
});

describe("roles and competitions", () => {
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <MembershipSection error={null} memberships={memberships} />
    </MemoryRouter>,
  );

  it("renders all four human role labels as read-only with role-specific CTAs", () => {
    expect(markup).toContain("Roller ve Yarışmalar");
    expect(markup).toContain("bu ekrandan değiştirilemez");
    expect(markup).toContain(ROLE_LABELS.COMPETITION_MANAGER);
    expect(markup).toContain(ROLE_LABELS.EVALUATION_MANAGER);
    expect(markup).toContain(ROLE_LABELS.REVIEWER);
    expect(markup).toContain(ROLE_LABELS.CONTESTANT);
    expect(markup).toContain("Kuruluma git");
    expect(markup).toContain("Başvurular");
    expect(markup).toContain("Değerlendirme");
    expect(markup).toContain("Hakemler");
    expect(markup).toContain("Değerlendirmeyi aç");
    expect(markup).toContain("Atamalarımı aç");
    expect(markup).toContain("Sonuçlarımı aç");
    expect(markup).not.toContain("Rolü değiştir");
    expect(markup).not.toContain("Üyelikten ayrıl");
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("COMPETITION_MANAGER");
    expect(markup).not.toContain("EVALUATION_MANAGER");
    expect(markup).not.toContain("REVIEWER");
    expect(markup).not.toContain("CONTESTANT");
  });
});

describe("account section", () => {
  it("shows identity, methods and logout without deletion", () => {
    const markup = renderToStaticMarkup(
      <AccountSection email="ayse@example.com" hasCredential hasGoogle name="Ayşe Yılmaz" />,
    );
    expect(markup).toContain("Hesap kimliği");
    expect(markup).toContain("Giriş yöntemleri");
    expect(markup).toContain("Oturum");
    expect(markup).toContain("Çıkış yap");
    expect(markup).toContain("Google");
    expect(markup).toContain("E-posta ve şifre");
    expect(markup).toContain("secondary-button");
    expect(markup).not.toContain("Hesabı sil");
    expect(markup).not.toContain("danger-button");
  });
});

describe("profile memberships empty state", () => {
  it("still renders for a user with zero memberships", () => {
    const markup = renderToStaticMarkup(<MembershipSection error={null} memberships={[]} />);
    expect(markup).toContain("Roller ve Yarışmalar");
    expect(markup).toContain("Henüz bir yarışma üyeliğiniz yok.");
    expect(markup).not.toContain("Rolü değiştir");
  });
});
