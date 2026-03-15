/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertTriangle } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.login(email, password);
      login(user);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      <div className="w-full max-w-md">
        <div className="card shadow-lg shadow-slate-200/50 pt-4 px-8 pb-8">
          <div className="flex justify-center overflow-hidden">
            <img
              src="/whiterock-logo.png"
              alt="WhiteRock"
              className="w-[161px] h-[161px] object-contain object-center block"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl mb-6 flex items-start gap-3 mt-4">
              <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-500" />
              <div className="text-sm">
                <p className="font-medium">{error}</p>
                {error === 'Invalid email or password' && (
                  <p className="mt-2 text-red-600/90">
                    Contact your administrator for access.
                  </p>
                )}
              </div>
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-5 mt-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
            <Button type="submit" className="w-full h-11 text-sm font-semibold" isLoading={loading}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
