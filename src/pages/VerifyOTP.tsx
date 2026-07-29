import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { verifyOTP } from "../api/auth";
import { useAuthStore } from "../store/authStore";


export default function VerifyOTP(){

  const [otp,setOtp] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);

  const navigate = useNavigate();

  const setToken = useAuthStore(
    state => state.setToken
  );


  const email = localStorage.getItem(
    "synthedge_email"
  );


  async function submitOTP(){

    try{

      setLoading(true);
      setError("");

      if(!email){
        throw new Error(
          "Email missing"
        );
      }


      const response = await verifyOTP(
        email,
        otp
      );


      if(response.access_token){

        setToken(
          response.access_token
        );

        navigate("/");

      } else {

        throw new Error(
          "Invalid OTP response"
        );

      }


    }catch(err:any){

      setError(
        err.message ||
        "OTP verification failed"
      );

    }
    finally{

      setLoading(false);

    }

  }


  return (

    <div className="auth-page">

      <h1>
        Verify OTP
      </h1>


      <p>
        Code sent to: {email}
      </p>


      <input

        type="text"

        placeholder="6 digit OTP"

        value={otp}

        onChange={
          e=>setOtp(e.target.value)
        }

      />


      <button

        onClick={submitOTP}

        disabled={loading}

      >

        {
          loading
          ?
          "Verifying..."
          :
          "Verify"
        }


      </button>


      {
        error &&
        <p>{error}</p>
      }


    </div>

  );

}