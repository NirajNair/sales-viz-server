import { betterAuth, Logger } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { config } from "./config";
import { loggerWithContext } from "./logger";
import { account, session, user, verification } from "../db/schema";

export const auth = betterAuth({
  secret: config.betterAuth.secret,
  url: config.betterAuth.url,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  logger: loggerWithContext as Logger,
});
