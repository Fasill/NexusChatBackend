import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || "fallback-secret-change-in-production",
  baseURL: process.env.BETTER_AUTH_URL || process.env.BASE_URL || "http://localhost:3001",
  trustedOrigins: process.env.TRUSTED_ORIGINS 
    ? process.env.TRUSTED_ORIGINS.split(",")
    : [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5000",
      ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache for 5 minutes
    },
  },
  advanced: {
    // Force secure cookies for production URLs (HTTPS)
    // Set to true if BETTER_AUTH_URL is https OR if NODE_ENV is production
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https") ?? 
                      process.env.NODE_ENV === "production",
    // Enable cross subdomain cookies when using custom domain
    crossSubDomainCookies: {
      enabled: false, // Set to true if using custom domain with subdomains
    },
    // Use SameSite=Lax for same-site subdomains, or None for cross-domain
    defaultCookieAttributes: {
      // Use "lax" for same-site, "none" for cross-domain
      sameSite: process.env.BETTER_AUTH_URL?.includes("localhost") ? "lax" : "none",
      // Only set secure to true if using HTTPS
      secure: process.env.BETTER_AUTH_URL?.startsWith("https") ?? process.env.NODE_ENV === "production",
      httpOnly: true,
      // Set domain if using custom domain for subdomain cookie sharing
      domain: undefined,
    },
  },
  emailAndPassword: {
    enabled: true
  },
});

export type Session = typeof auth.$Infer.Session;

