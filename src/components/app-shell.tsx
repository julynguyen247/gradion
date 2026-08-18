"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { User } from "@/lib/client/types";
import { Brand } from "./brand";
import { PageSkeleton } from "./spinner";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal)
      .then(({ user: nextUser }) => {
        if (!nextUser) {
          router.replace("/");
          return;
        }
        setUser(nextUser);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUser(null);
        router.replace("/");
      });
    return () => controller.abort();
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.deleteSession();
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  if (!user) {
    return (
      <div className="app-frame">
        <header className="topbar"><div className="topbar-inner"><Brand /></div></header>
        <main><PageSkeleton /></main>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="main-nav" aria-label="Main navigation">
            <Link href="/projects">Projects</Link>
          </nav>
          <div className="user-menu">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span className="user-name">{user.name}</span>
            <button className="text-button" type="button" onClick={signOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="footer">
        <span>GRADION <b aria-hidden="true">/</b> Scaling Business</span>
        <span className="footer-note">Built for stories worth seeing.</span>
      </footer>
    </div>
  );
}
