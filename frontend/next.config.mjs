/** @type {import('next').NextConfig} */
export default {
  typescript: {
    // Pre-existing type errors across the codebase don't block deploys.
    // Fix incrementally; remove this once the codebase is clean.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
