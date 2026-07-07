/** @type {import('next').NextConfig} */
const nextConfig = {
  // LTI tools render inside the LMS iframe. Allow your LMS origins to embed you,
  // and make session cookies work cross-site (SameSite=None; Secure).
  async headers() {
    const platformOrigins = (process.env.LTI_PLATFORM_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors 'self' ${platformOrigins.join(' ')}`.trim(),
          },
        ],
      },
    ]
  },
}

export default nextConfig
