import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoom - Video Conferencing, Web Meetings, Webinars",
  description: "Experience high-quality video conferencing, instant web meetings, and scheduled webinars with Zoom's premium, responsive clone interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
