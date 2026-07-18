import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-jp";
import "./globals.css";

export const metadata: Metadata = {
	title: "夏の抜け道",
	description: "空いている時間から、その日に行ける涼しい場所を見つけます。",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f99a49" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return <html lang="ja"><body>{children}</body></html>;
}
