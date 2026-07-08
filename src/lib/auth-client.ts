// Cliente better-auth para o browser (substitui supabase.auth no front).
// baseURL default = origem atual (same-origin), então não precisa de env no client.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
