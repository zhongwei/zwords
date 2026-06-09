import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import CanvasBackground from "../shared/CanvasBackground";

export default function MainLayout() {
  return (
    <div className="relative min-h-screen">
      <CanvasBackground />
      <Sidebar />
      <main className="ml-64 min-h-screen p-8">
        <Outlet />
      </main>
    </div>
  );
}
