/** @type {import('next').NextConfig} */

// Security headers applied to every response. These are defence-in-depth:
// the app already escapes user input and scopes every query by company, but
// these headers harden the browser side (clickjacking, MIME sniffing, referrer
// leakage, and forced HTTPS) at zero runtime cost.
const securityHeaders = [
  // Don't let the site be framed by another origin (clickjacking protection).
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from MIME-sniffing a response away from its declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin on cross-origin navigations; never leak full URLs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We don't use these device APIs — deny them outright.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
  // Force HTTPS for two years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  // Don't advertise the framework to attackers.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
