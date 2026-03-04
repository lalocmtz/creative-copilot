import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Plus, LogOut, Sparkles, Film } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/assets/new", icon: Plus, label: "Nuevo Video" },
  { to: "/motion", icon: Film, label: "Motion Prompts" },
];

const AppLayout = () => {
  const { user, signOut } = useAuth();
  const { data: credits } = useCredits();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-[220px] flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-sm tracking-wide">UGC Scale Engine</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-3">
          <div className="px-3 py-2.5 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Créditos</p>
            <p className="text-sm font-semibold text-foreground">
              {credits?.remaining ?? "…"} <span className="text-muted-foreground font-normal">restantes</span>
            </p>
          </div>
          <Button variant="outline" size="sm" className="w-full text-xs" disabled>Comprar Más</Button>
          <div className="flex items-center gap-2 px-3">
            <p className="text-xs text-muted-foreground truncate flex-1" title={user?.email ?? ""}>{user?.email}</p>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={signOut} title="Cerrar sesión">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
