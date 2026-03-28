import './globals.css';

export const metadata = {
  title: 'BRD Generator — AI-Driven Requirements Extraction',
  description: 'AI-powered Business Requirements Document generator using DeepSeek V3.2 for intelligent NLP parsing and requirement classification.',
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
