import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import CanvasBackground from "../shared/CanvasBackground";

const STORAGE_KEY = "mywords-sidebar-collapsed";

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "1"
  );
  const { pathname } = useLocation();
  const isDetail = pathname.startsWith("/words/");

  const toggle = () => {
    const next = !collapsed;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    setCollapsed(next);
  };

  return (
    <div className={`relative min-h-screen ${isDetail ? "bg-[#0a0a14]" : ""}`}>
      {!isDetail && <CanvasBackground />}
      <Sidebar collapsed={collapsed} onToggle={toggle} dark={isDetail} />
      <main
        className={`min-h-screen p-8 transition-all duration-300 ${
          collapsed ? "ml-16" : "ml-64"
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
