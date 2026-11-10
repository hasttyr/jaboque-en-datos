import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./movimiento.css";

const fuente = Inter({
  variable: "--fuente",
  subsets: ["latin"],
  weight: ["200", "400", "600"],
});

export const metadata: Metadata = {
  title: "Jaboque en datos",
  description:
    "Contaminación y basura en el Humedal Jaboque y el río Bogotá con datos abiertos, más una maqueta con sensores en tiempo real.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={fuente.variable} suppressHydrationWarning>
      <head>
        {/* Las animaciones de entrada solo ocultan contenido si JavaScript está disponible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.js='1'" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
