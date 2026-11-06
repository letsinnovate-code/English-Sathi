import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "English Sathi - Admin Dashboard",
  description: "Administrative console for English Sathi",
};

export default function AdminLayout({
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

