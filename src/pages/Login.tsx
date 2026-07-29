import { useState } from "react";
import { authAPI } from "../api/api";
import { useNavigate } from "react-router-dom";


export default function Login(){

  const [email,setEmail] = useState("");

  const [loading,setLoading] = useState(false);

  const [error,setError] = useState("");

  const navigate = useNavigate();



  async function requestOTP(){

    try{

      setLoading(true);
      setError("");

      await authAPI.resendOTP(email);


      localStorage.setItem(
        "synthedge_email",
        email
      );


      navigate("/verify");


    }catch(err:any){

      setError(
        err.message || "Failed to send OTP"
      );

    }
    finally{

      setLoading(false);

    }

  }



  return (

    <div className="auth-page">

      <h1>
        SynthEdge Login
      </h1>


      <input

        type="email"

        placeholder="Email"

        value={email}

        onChange={
          e=>setEmail(e.target.value)
        }

      />


      <button

        onClick={requestOTP}

        disabled={loading}

      >

        {
          loading
          ?
          "Sending..."
          :
          "Send OTP"
        }

      </button>


      {
        error &&
        <p>{error}</p>
      }


    </div>

  );

}
