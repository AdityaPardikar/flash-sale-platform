import React from 'react';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">⚡ Flash Sale Platform</h1>
          <p className="text-gray-600 mt-2">High-performance distributed flash sale system</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-4xl mb-2">✓</div>
              <h2 className="text-xl font-semibold text-gray-900">Backend Ready</h2>
              <p className="text-gray-600 mt-2">API running on localhost:3000</p>
            </div>
          </div>

          {/* Frontend Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-4xl mb-2">🎨</div>
              <h2 className="text-xl font-semibold text-gray-900">Frontend Ready</h2>
              <p className="text-gray-600 mt-2">React + Vite running</p>
            </div>
          </div>

          {/* Database Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-4xl mb-2">💾</div>
              <h2 className="text-xl font-semibold text-gray-900">Database Ready</h2>
              <p className="text-gray-600 mt-2">PostgreSQL + Redis configured</p>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h2>
          <div className="bg-white rounded-lg shadow p-8">
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span>Zero overselling with atomic inventory operations</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span>Fair FIFO queue system for 50K+ concurrent users</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span>Real-time updates via WebSocket connections</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span>Complete authentication with JWT tokens</span>
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-3">✓</span>
                <span>Production-ready architecture with Docker</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Tech Stack</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Node.js', 'React', 'TypeScript', 'PostgreSQL', 'Redis', 'Socket.io', 'Tailwind', 'Docker'].map(
              (tech) => (
                <div key={tech} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
                  <p className="text-sm font-semibold text-indigo-900">{tech}</p>
                </div>
              )
            )}
          </div>
        </section>

        {/* Quick Start */}
        <section className="mt-12 bg-indigo-600 rounded-lg shadow p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Quick Start</h2>
          <pre className="bg-indigo-900 p-4 rounded overflow-x-auto text-sm">
{`npm install
npm run docker:up
npm run dev

Backend: http://localhost:3000
Frontend: http://localhost:5173`}
          </pre>
        </section>
      </main>

      <footer className="bg-gray-900 text-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center">
          <p className="text-gray-400">Flash Sale Platform © 2026</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
