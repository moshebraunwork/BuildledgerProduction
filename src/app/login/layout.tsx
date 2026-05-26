// Auth pages are interactive and must render at request time, not build time.
export const dynamic = "force-dynamic";
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
