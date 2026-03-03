import { NavLink, Outlet } from "react-router-dom";
import { Film, LayoutDashboard, Zap, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ingest", icon: Film, label: "Nueva Ingesta" },
  { to: "/settings", icon: Settings, label: "Config" },
];

const AppLayout = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
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
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-3">
          <div className="px-3 py-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Créditos hoy</p>
            <p className="text-sm font-semibold text-foreground">$4.20 <span className="text-muted-foreground font-normal">/ $50</span></p>
          </div>

          <div className="flex items-center gap-2 px-3">
            <p className="text-xs text-muted-foreground truncate flex-1" title={user?.email ?? ""}>
              {user?.email}
            </p>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={signOut} title="Cerrar sesión">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
