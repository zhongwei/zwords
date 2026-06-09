import { Routes, Route } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import WordsList from "./pages/WordsList";
import WordDetail from "./pages/WordDetail";
import Review from "./pages/Review";
import Quiz from "./pages/Quiz";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="words" element={<WordsList />} />
        <Route path="words/:id" element={<WordDetail />} />
        <Route path="review" element={<Review />} />
        <Route path="quiz" element={<Quiz />} />
      </Route>
    </Routes>
  );
}
