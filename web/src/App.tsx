import { Navigate, Route, Routes } from "react-router-dom";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { HomePage } from "./pages/HomePage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { RoomPage } from "./pages/RoomPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<CreateRoomPage />} />
      <Route path="/join" element={<JoinRoomPage />} />
      <Route path="/join/:roomId" element={<JoinRoomPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="/watch/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
