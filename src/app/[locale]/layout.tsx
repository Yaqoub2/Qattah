import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { routing } from "@/i18n/routing";
import { Toaster } from "sonner";
import { RegisterSw } from "@/components/register-sw";
import { NavigationProgress } from "@/components/navigation-progress";
import "../globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});

const plexAr = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-ar",
});

export const metadata = {
  title: "قطة | Qattah",
  description: "غطّوا المصروف، وخلّوا الحق واضح",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "قطة", statusBarStyle: "default" as const },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "ar" | "en")) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={`${plex.variable} ${plexAr.variable}`}>
      <body className={`${plexAr.className} ${plex.className} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NavigationProgress />
          {children}
          <RegisterSw />
          <Toaster position={dir === "rtl" ? "top-left" : "top-right"} richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
