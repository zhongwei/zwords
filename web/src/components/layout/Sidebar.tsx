import { NavLink } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard,
  BookOpen,
  RefreshCw,
  HelpCircle,
  Languages,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, key: "dashboard" as const },
  { path: "/words", icon: BookOpen, key: "words" as const },
  { path: "/review", icon: RefreshCw, key: "review" as const },
  { path: "/quiz", icon: HelpCircle, key: "quiz" as const },
];

export default function Sidebar() {
  const { t, locale, setLocale } = useI18n();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-lg font-bold text-white">
          M
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">{t.app.title}</h1>
          <p className="text-xs text-violet-300">{t.app.subtitle}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-violet-500/20 text-violet-200 shadow-lg shadow-violet-500/10"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {t.nav[item.key]}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <button
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Languages className="h-5 w-5" />
          {locale === "zh" ? "English" : "中文"}
        </button>
      </div>
    </aside>
  );
}
