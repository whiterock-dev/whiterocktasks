/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

function ConfigError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Configuration required</h1>
        <p className="text-slate-600 text-sm mb-4">{message}</p>
        <p className="text-slate-500 text-xs">
          Copy <code className="bg-slate-100 px-1 rounded">.env.example</code> to <code className="bg-slate-100 px-1 rounded">.env</code> and add your Firebase project credentials. See README.
        </p>
      </div>
    </div>
  );
}

import('./App')
  .then((m) => {
    root.render(
      <React.StrictMode>
        <m.default />
      </React.StrictMode>
    );
  })
  .catch((err: Error) => {
    const isConfigError =
      err?.message?.includes('Missing Firebase config') ||
      err?.message?.includes('invalid-api-key');
    root.render(
      <ConfigError
        message={
          isConfigError
            ? 'Firebase is not configured or the API key is invalid.'
            : err?.message ?? 'Failed to load app.'
        }
      />
    );
  });
