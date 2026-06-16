import { NavLink } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard,
  BookOpen,
  RefreshCw,
  HelpCircle,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, key: "dashboard" as const },
  { path: "/words", icon: BookOpen, key: "words" as const },
  { path: "/review", icon: RefreshCw, key: "review" as const },
  { path: "/quiz", icon: HelpCircle, key: "quiz" as const },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  dark?: boolean;
}

export default function Sidebar({ collapsed, onToggle, dark }: SidebarProps) {
  const { t, locale, setLocale } = useI18n();

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-white/10 transition-all duration-300 ${
        dark ? "bg-[#0f0f1a]" : "bg-black/40 backdrop-blur-xl"
      } ${collapsed ? "w-16" : "w-64"}`}
    >
      <div
        className={`flex border-b border-white/10 ${
          collapsed
            ? "flex-col items-center gap-2 px-2 py-4"
            : "items-center gap-3 px-6 py-5"
        }`}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-lg font-bold text-white">
          M
        </div>
        {collapsed ? (
          <button
            onClick={onToggle}
            aria-label={t.app.expandSidebar}
            title={t.app.expandSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-white">{t.app.title}</h1>
              <p className="truncate text-xs text-violet-300">{t.app.subtitle}</p>
            </div>
            <button
              onClick={onToggle}
              aria-label={t.app.collapseSidebar}
              title={t.app.collapseSidebar}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            title={collapsed ? t.nav[item.key] : undefined}
            aria-label={collapsed ? t.nav[item.key] : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-lg text-sm font-medium transition-all duration-200 ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"
              } ${
                isActive
                  ? "bg-violet-500/20 text-violet-200 shadow-lg shadow-violet-500/10"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && t.nav[item.key]}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <button
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          title={collapsed ? (locale === "zh" ? "English" : "中文") : undefined}
          aria-label={locale === "zh" ? "English" : "中文"}
          className={`flex w-full items-center rounded-lg text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white ${
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"
          }`}
        >
          <Languages className="h-5 w-5 flex-shrink-0" />
          {!collapsed && (locale === "zh" ? "English" : "中文")}
        </button>
      </div>
    </aside>
  );
}
