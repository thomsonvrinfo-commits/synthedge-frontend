import { Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Dashboard from "./pages/Dashboard";
import Replay from "./pages/Replay";
import Backtest from "./pages/Backtest";
import Journal from "./pages/Journal";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

import Login from "./pages/Login";
import VerifyOTP from "./pages/VerifyOTP";


function ProtectedLayout(){

  return (

    <ProtectedRoute>

      <Layout/>

    </ProtectedRoute>

  );

}


export default function AppRoutes(){

return (

<Routes>


{/* PUBLIC */}

<Route
path="/login"
element={<Login/>}
/>


<Route
path="/verify"
element={<VerifyOTP/>}
/>



{/* PROTECTED */}

<Route
path="/"
element={<ProtectedLayout/>}
>


<Route
index
element={<Dashboard/>}
/>


<Route
path="replay"
element={<Replay/>}
/>


<Route
path="backtest"
element={<Backtest/>}
/>


<Route
path="journal"
element={<Journal/>}
/>


<Route
path="analytics"
element={<Analytics/>}
/>


<Route
path="settings"
element={<Settings/>}
/>


</Route>


</Routes>

)

}
