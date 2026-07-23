"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();

  const [isLogin, setIsLogin] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [loading, setLoading] = useState(false);

  async function register() {
    setLoading(true);

    try{
      const response = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok){
        console.log(data.message);
        console.log("Registration failed");
        setLoading(false);
        return;
      }

      console.log(data);
      setLoading(false);
      router.replace(`/pages/${data.message}`);
    }
    catch (error) {
      console.error("Error during registration:", error);
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      
      const data = await response.json();
      
      if (!response.ok) {
        console.log(data.message);
        setLoading(false);
        return;
      }

      console.log(data);
      setLoading(false);
      router.replace(`/pages/${data.message}`);
    }
    catch (error) {
      console.error("Error during login:", error);
      setLoading(false);
    }
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4" dir="rtl">
      <div className="relative w-full max-w-[450px] md:max-w-[900px] h-[650px] md:h-[550px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:block transition-all duration-500">
        
        <div
          className={`absolute top-0 w-full md:w-1/2 h-[60%] md:h-full flex items-center justify-center transition-all duration-700 ease-in-out z-10 ${
            isLogin 
              ? "translate-y-[65%] md:translate-y-0 right-0 md:right-1/2" 
              : "translate-y-0 right-0 md:right-0"
          }`}
        >
          <div
            className={`absolute w-[90%] sm:w-[350px] transition-all duration-500 ease-in-out ${
              !isLogin
                ? "opacity-100 pointer-events-auto scale-100"
                : "opacity-0 pointer-events-none scale-95"
            }`}
          >
            <RegisterForm registerName={registerName} setRegisterName={setRegisterName} registerEmail={registerEmail} setRegisterEmail={setRegisterEmail} registerPassword={registerPassword} setRegisterPassword={setRegisterPassword} register={register} loading={loading} />
          </div>

          <div
            className={`absolute w-[90%] sm:w-[350px] transition-all duration-500 ease-in-out ${
              isLogin
                ? "opacity-100 pointer-events-auto scale-100"
                : "opacity-0 pointer-events-none scale-95"
            }`}
          >
            <LoginForm loginEmail={loginEmail} setLoginEmail={setLoginEmail} loginPassword={loginPassword} setLoginPassword={setLoginPassword} login={login} loading={loading} />
          </div>
        </div>

        <div
          className={`absolute w-full md:w-1/2 h-[40%] md:h-full bg-blue-600 text-white flex flex-col justify-center items-center transition-all duration-700 ease-in-out z-20 ${
            isLogin 
              ? "top-0 md:top-0 right-0 md:right-0" 
              : "top-[60%] md:top-0 right-0 md:right-1/2"
          }`}
        >
          <div
            className={`absolute flex flex-col items-center px-6 md:px-12 text-center transition-all duration-500 ease-in-out ${
              !isLogin
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 md:translate-y-0 pointer-events-none"
            }`}
          >
            <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4">You already have an account</h1>
            <p className="text-sm md:text-base mb-4 md:mb-6">Log in to access your account.</p>
            <button
              onClick={() => {
                setIsLogin(true);
                setRegisterName("");
                setRegisterEmail("");
                setRegisterPassword("");
              }}
              className="border-2 border-white px-6 py-2 md:px-8 md:py-3 rounded-full hover:bg-white hover:text-blue-600 transition duration-300 text-sm md:text-base font-semibold"
            >
              Login
            </button>
          </div>

          <div
            className={`absolute flex flex-col items-center px-6 md:px-12 text-center transition-all duration-500 ease-in-out ${
              isLogin
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-4 md:translate-y-0 pointer-events-none"
            }`}
          >
            <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4">Don't have an account?</h1>
            <p className="text-sm md:text-base mb-4 md:mb-6">Create a new account in seconds.</p>
            <button
              onClick={() => {
                setIsLogin(false);
                setRegisterName("");
                setRegisterEmail("");
                setRegisterPassword("");
              }}
              className="border-2 border-white px-6 py-2 md:px-8 md:py-3 rounded-full hover:bg-white hover:text-blue-600 transition duration-300 text-sm md:text-base font-semibold"
            >
              Create Account
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function RegisterForm({registerName, setRegisterName, registerEmail, setRegisterEmail, registerPassword, setRegisterPassword, register, loading }:{registerName: string; setRegisterName: React.Dispatch<React.SetStateAction<string>>; registerEmail: string; setRegisterEmail: React.Dispatch<React.SetStateAction<string>>; registerPassword: string; setRegisterPassword: React.Dispatch<React.SetStateAction<string>>; register: () => void; loading: boolean;}) {
  return (
    <form className="space-y-3 md:space-y-4" onSubmit={(e) => {e.preventDefault(); register();}}>
      <h2 className="text-2xl md:text-4xl font-bold text-center mb-4 md:mb-6 text-gray-800">Create Account</h2>
      <input
        type="text"
        required
        value={registerName}
        placeholder="Name"
        className="w-full p-2.5 md:p-3 bg-gray-100 rounded-lg outline-none text-black font-bold focus:ring-2 focus:ring-blue-500 transition-all text-sm md:text-base"
        onChange={(e) => setRegisterName(e.target.value)}
      />
      <input
        type="email"
        required
        value={registerEmail}
        placeholder="Email"
        className="w-full p-2.5 md:p-3 bg-gray-100 rounded-lg outline-none text-black font-bold focus:ring-2 focus:ring-blue-500 transition-all text-sm md:text-base"
        onChange={(e) => setRegisterEmail(e.target.value)}
      />
      <input
        type="password"
        required
        value={registerPassword}
        placeholder="Password"
        className="w-full p-2.5 md:p-3 bg-gray-100 rounded-lg outline-none text-black font-bold focus:ring-2 focus:ring-blue-500 transition-all text-sm md:text-base"
        onChange={(e) => setRegisterPassword(e.target.value)}
      />
      <button type="submit" className="w-full bg-blue-600 text-white py-2.5 md:py-3 rounded-lg hover:bg-blue-700 transition duration-300 text-sm md:text-base font-semibold" disabled={loading}>
        {loading ? "Creating Account..." : "Create Account"}
      </button>
    </form>
  );
}

function LoginForm({loginEmail, setLoginEmail, loginPassword, setLoginPassword, login, loading }:{loginEmail: string; setLoginEmail: React.Dispatch<React.SetStateAction<string>>; loginPassword: string; setLoginPassword: React.Dispatch<React.SetStateAction<string>>; login: () => void; loading: boolean;}) {
  return (
    <form className="space-y-3 md:space-y-4" onSubmit={(e) => {e.preventDefault(); login();}}>
      <h2 className="text-2xl md:text-4xl font-bold text-center mb-4 md:mb-6 text-gray-800">Login</h2>
      <input
        type="email"
        required
        value={loginEmail}
        placeholder="Email"
        className="w-full p-2.5 md:p-3 bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-black font-bold text-sm md:text-base"
        onChange={(e) => setLoginEmail(e.target.value)}
      />
      <input
        type="password"
        required
        value={loginPassword}
        placeholder="Password"
        className="w-full p-2.5 md:p-3 bg-gray-100 rounded-lg text-black font-bold   outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm md:text-base"
        onChange={(e) => setLoginPassword(e.target.value)}
      />
      <button type="submit" className="w-full bg-blue-600 text-white py-2.5 md:py-3 rounded-lg hover:bg-blue-700 transition duration-300 text-sm md:text-base font-semibold" disabled={loading}>
        {loading ? "Logging In..." : "Login"}
      </button>
    </form>
  );
}