import "./globals.css";

export const metadata = {
  title: "VoIP Agent Console",
  description: "Twilio Media Streams debug console"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
