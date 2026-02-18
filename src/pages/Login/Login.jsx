import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useStorage } from '../../hooks/useStorage';
import './Login.css';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const storage = useStorage();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (username && password) {
            try {
                const user = await api.login(username, password);

                // Persist user to storage for indexedDBService access
                await storage.setAuth({ user: user });

                onLogin(user);
                navigate('/');
            } catch (err) {
                console.error("Login error:", err);
                setError('Login failed. Please checks credentials.');
            }
        } else {
            setError('Please enter username and password');
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h2>Survey Tool Login</h2>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                        />
                    </div>
                    <button type="submit" className="login-btn">Login</button>
                </form>
            </div>
        </div>
    );
};

export default Login;
