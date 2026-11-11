"use client";

import { ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "🏠", label: "Dashboard" },
  { href: "/dashboard/settings", icon: "⚙️", label: "Settings" },
];

function Sidebar() {
  const { state, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const name = state.status === "authenticated"
    ? state.session.profile.displayName || state.session.user.email
    : "";

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">🗣️ Sathi</div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item${pathname === href ? " active" : ""}`}
          >
            <span>{icon}</span> {label}
          </Link>
        ))}
      </nav>

      <div style={{ marginTop: "auto" }}>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>{name}</div>
        <button className="btn btn-ghost" style={{ width: "100%", fontSize: "0.875rem" }} onClick={handleLogout}>
          Sign Out
        </button>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "unauthenticated") {
      router.replace("/login");
    } else if (state.status === "authenticated" && state.session.onboardingRequired) {
      router.replace("/onboarding");
    }
  }, [state, router]);

  if (state.status === "loading") {
    return <div className="loading-screen"><span className="spinner" /><span>Loading…</span></div>;
  }

  if (state.status === "unauthenticated" || state.session.onboardingRequired) {
    return null;
  }

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

