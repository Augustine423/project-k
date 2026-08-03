import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { AuthPage } from "./pages/AuthPage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { DashboardPage } from "./pages/DashboardPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { RoomPage } from "./pages/RoomPage";
import { useAuth } from "./hooks/useAuth";

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/create"
        element={
          <RequireAuth>
            <CreateRoomPage />
          </RequireAuth>
        }
      />
      {/* Guests can join via invite link without an account */}
      <Route path="/join" element={<JoinRoomPage />} />
      <Route path="/join/:roomId" element={<JoinRoomPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="/watch/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
