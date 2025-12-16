// app/layout.tsx
import type { Metadata } from "next";
// Courier Prime 폰트 추가 (타자기 느낌)
import { Courier_Prime } from "next/font/google"; 
import "./globals.css";

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-courier", // CSS 변수로 사용
});

export const metadata: Metadata = {
  title: "GrimGriGi",
  description: "Retro report style homepage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${courierPrime.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
