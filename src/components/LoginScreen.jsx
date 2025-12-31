import { useState } from 'react';
import './LoginScreen.css';

// Vi hämtar PIN från env här direkt, eller skickar in den som prop.
// För enkelhetens skull tar vi den här.
const SITE_PIN = import.meta.env.VITE_APP_PIN || "0000";

const LoginScreen = ({ onLogin }) => {
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pinInput === SITE_PIN) {
      onLogin(); // Säg till App.jsx att vi är inloggade
    } else {
      setPinError(true);
      setPinInput("");
      setTimeout(() => setPinError(false), 1000);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <img 
          src="logo.png" 
          alt="Logo" 
          className="login-logo" 
          onError={(e) => e.target.style.display = 'none'}
        />
        <h1>Prästbyrån Kassa</h1>
        <p>Ange PIN-kod för att öppna</p>
        <form onSubmit={handleSubmit}>
          <input 
            type="password" 
            value={pinInput} 
            onChange={(e) => setPinInput(e.target.value)} 
            className={`pin-input ${pinError ? 'error' : ''}`} 
            placeholder="****" 
            autoFocus 
            maxLength={4} 
          />
          <button type="submit" className="login-btn">Öppna</button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;