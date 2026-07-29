import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Redirect legacy /upgrade route to the new /pricing page
export default function Upgrade() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/pricing", { replace: true });
  }, [navigate]);
  return null;
}