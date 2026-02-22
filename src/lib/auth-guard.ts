import { auth } from "./auth";
import { AuthenticationError } from "./errors";

export const requireAuth = async (request: Request) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) throw AuthenticationError("Please try logging in first");
  return session;
};
