"use server";

import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/session";

export async function signInWithGoogle() {
  if (!isAuthConfigured()) redirect("/");
  const { signIn } = await import("@/lib/auth");
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction() {
  if (!isAuthConfigured()) redirect("/login");
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/login" });
}
