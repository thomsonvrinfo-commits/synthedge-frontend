const AUTH_URL =
"http://127.0.0.1:8787";


const API_URL =
"http://127.0.0.1:8788";



export function setToken(token:string){

    localStorage.setItem(
        "synthedge_token",
        token
    );

}



export function getToken(){

    return localStorage.getItem(
        "synthedge_token"
    );

}



export function clearToken(){

    localStorage.removeItem(
        "synthedge_token"
    );

}



async function request(
    url:string,
    options:any={}
){


    const token=getToken();



    const headers:any={

        "Content-Type":
        "application/json",

        ...(options.headers || {})

    };



    if(token){

        headers.Authorization =
        `Bearer ${token}`;

    }



    const response =
    await fetch(
        url,
        {
            ...options,
            headers
        }
    );



    const data =
    await response.json();



    if(!response.ok){

        throw new Error(
            data.error ||
            "Request failed"
        );

    }



    return data;

}





export const authAPI = {


    verifyOTP(
        email:string,
        otpCode:string
    ){

        return request(
            `${AUTH_URL}/auth/verify-otp`,
            {

                method:"POST",

                body:JSON.stringify({

                    email,

                    otpCode

                })

            }
        );

    },



    resendOTP(
        email:string
    ){

        return request(
            `${AUTH_URL}/auth/resend-otp`,
            {

                method:"POST",

                body:JSON.stringify({

                    email

                })

            }
        );

    }



};





export const tradesAPI = {


    list(){

        return request(
            `${API_URL}/trades`
        );

    },


    create(data:any){

        return request(
            `${API_URL}/trades`,
            {

                method:"POST",

                body:JSON.stringify(data)

            }
        );

    },


    update(
        id:string,
        data:any
    ){

        return request(
            `${API_URL}/trades/${id}`,
            {

                method:"PUT",

                body:JSON.stringify(data)

            }
        );

    },


    remove(
        id:string
    ){

        return request(
            `${API_URL}/trades/${id}`,
            {

                method:"DELETE"

            }
        );

    }


};
