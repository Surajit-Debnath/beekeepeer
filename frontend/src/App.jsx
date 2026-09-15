import { AuthProvider, Protected } from "./pages/AppPages";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import { MyBatchesPage, EligibleBatchesPage } from "./pages/BatchesPage";
import CreateBatchPage from "./pages/CreateBatchPage";
import LabPage from "./pages/LabPage";
import RequestsPage from "./pages/RequestsPage";
import RetailerPage from "./pages/RetailerPage";
import ConsumerPage from "./pages/ConsumerPage";
import BatchDetailsPage from "./pages/BatchDetailsPage";
import PublicVerificationPage from "./pages/PublicVerificationPage";
import { Navigate, Route, Routes } from "react-router-dom";

const rolePath = {
  ADMIN: "/admin",
  BEEKEEPER: "/dashboard",
  LAB_INSPECTOR: "/lab",
  PROCESSOR: "/dashboard",
  DISTRIBUTOR: "/dashboard",
  RETAILER: "/retailer",
  CONSUMER: "/consumer"
};

export default function App() {
  return <AuthProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/verify/:id" element={<PublicVerificationPage />} />
    <Route path="/" element={<HomePage />} />
    <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
    <Route path="/admin" element={<Protected roles={["ADMIN"]}><AdminPage /></Protected>} />
    <Route path="/batches" element={<Protected><MyBatchesPage /></Protected>} />
    <Route path="/batches/create" element={<Protected roles={["BEEKEEPER"]}><CreateBatchPage /></Protected>} />
    <Route path="/batches/:id" element={<Protected><BatchDetailsPage /></Protected>} />
    <Route path="/eligible" element={<Protected roles={["PROCESSOR", "DISTRIBUTOR", "RETAILER"]}><EligibleBatchesPage /></Protected>} />
    <Route path="/lab" element={<Protected roles={["LAB_INSPECTOR"]}><LabPage /></Protected>} />
    <Route path="/requests" element={<Protected roles={["BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"]}><RequestsPage /></Protected>} />
    <Route path="/retailer" element={<Protected roles={["RETAILER"]}><RetailerPage /></Protected>} />
    <Route path="/consumer" element={<Protected roles={["CONSUMER"]}><ConsumerPage /></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider>;
}

export { rolePath };
