import './globals.css';

export const metadata = {
  title: 'BRD Generator — AI-Driven Requirements Extraction',
  description: 'AI-powered Business Requirements Document generator using Mistral (local) for data filtering and DeepSeek for BRD generation.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
