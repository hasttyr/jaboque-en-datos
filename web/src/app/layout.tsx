import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const fuente = Archivo({
  variable: "--fuente",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Jaboque en datos",
  description:
    "Contaminación y basura en el Humedal Jaboque y el río Bogotá con datos abiertos, más una maqueta con sensores en tiempo real que avisa por Telegram.",
};

export const viewport: Viewport = {
  themeColor: "#0d3b2e",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={fuente.variable}>
      <body>{children}</body>
    </html>
  );
}
