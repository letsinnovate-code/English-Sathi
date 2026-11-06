import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "English Sathi - AI English Learning",
  description: "Learn English with your AI conversation partner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

