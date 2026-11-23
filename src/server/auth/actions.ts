"use server";

import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/server/auth/session";

export async function signInWithGoogle() {
  if (!isAuthConfigured()) redirect("/");
  const { signIn } = await import("@/server/auth/auth");
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction() {
  if (!isAuthConfigured()) redirect("/login");
  const { signOut } = await import("@/server/auth/auth");
  await signOut({ redirectTo: "/login" });
}
