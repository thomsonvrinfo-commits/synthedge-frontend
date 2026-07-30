import { create } from "zustand";

interface AuthState {

  token:string | null;

  setToken:(token:string)=>void;

  logout:()=>void;

}


export const useAuthStore = create<AuthState>((set)=>({

  token:
    localStorage.getItem("synthedge_token"),


  setToken:(token)=>{

    localStorage.setItem(
      "synthedge_token",
      token
    );


    set({
      token
    });

  },


  logout:()=>{

    localStorage.removeItem(
      "synthedge_token"
    );


    set({
      token:null
    });

  }


}));
