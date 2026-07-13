import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Eye, EyeOff, Hexagon } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';

// Floating particles for the nebula background
function NebulaParticles() {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 10,
    opacity: Math.random() * 0.6 + 0.2,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0 ? 'rgba(56, 189, 248, 0.6)' : p.id % 3 === 1 ? 'rgba(139, 92, 246, 0.5)' : 'rgba(236, 72, 153, 0.4)',
            boxShadow: `0 0 ${p.size * 4}px ${p.id % 3 === 0 ? 'rgba(56, 189, 248, 0.4)' : p.id % 3 === 1 ? 'rgba(139, 92, 246, 0.3)' : 'rgba(236, 72, 153, 0.3)'}`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [p.opacity, p.opacity * 0.3, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(username, password);
      if (!success) {
        setError('Invalid credentials. Try Login User and Password');
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Background Layer */}
      <div className="absolute inset-0">
        {/* Hummingbird Nebula background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/hummingbird-nebula.jpg)' }}
        />
        {/* Dark overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/40 to-black/60" />
        {/* Animated particles */}
        <NebulaParticles />
        {/* Bottom glow matching nebula colors */}
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-cyan-500/10 via-purple-500/5 to-transparent" />
      </div>

      {/* Left side - Branding area (hidden on small screens) */}
      <div className="hidden lg:flex flex-1 flex-col justify-end p-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Hexagon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">YESI-FULFILLMENT</h1>
              <p className="text-[10px] text-white/50 uppercase tracking-[0.3em]">Warehouse Management System</p>
            </div>
          </div>
          <p className="text-sm text-white/40 max-w-md leading-relaxed">
            Advanced inventory control, traceability, and fulfillment operations 
            powered by real-time analytics and intelligent automation.
          </p>
        </motion.div>
      </div>

      {/* Right side - Login card */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={mounted ? { opacity: 1, x: 0, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          {/* iOS Glossy Card */}
          <div
            className="relative rounded-3xl p-8 overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 30, 35, 0.85) 0%, rgba(10, 10, 15, 0.95) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Top glossy highlight */}
            <div
              className="absolute top-0 left-4 right-4 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
            />

            {/* Subtle inner glow */}
            <div
              className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(56, 189, 248, 0.4), transparent 70%)' }}
            />

            {/* Logo */}
            <div className="flex flex-col items-center mb-8 relative">
              <motion.div
                initial={{ scale: 0 }}
                animate={mounted ? { scale: 1 } : {}}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.4 }}
                className="w-16 h-16 rounded-2xl mb-5 flex items-center justify-center relative"
                style={{
                  background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                  boxShadow: '0 8px 32px rgba(56, 189, 248, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                <Hexagon className="w-8 h-8 text-white" strokeWidth={1.5} />
              </motion.div>
              <h2 className="text-lg font-bold text-white tracking-tight">Welcome Back</h2>
              <p className="text-[11px] text-white/40 mt-1">Sign in to access your warehouse</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                className="mb-4 p-3 rounded-xl text-xs text-red-300"
                style={{
                  background: 'linear-gradient(180deg, rgba(230, 57, 70, 0.15) 0%, rgba(230, 57, 70, 0.08) 100%)',
                  border: '1px solid rgba(230, 57, 70, 0.2)',
                }}
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 relative">
              {/* Username field */}
              <div>
                <label className="block text-[10px] text-white/40 uppercase tracking-[0.2em] mb-2 font-medium">Username</label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/30 rounded-xl text-white text-sm py-3 px-4 focus:outline-none transition-all duration-300 placeholder:text-white/20"
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                    }}
                    placeholder="Enter username"
                    autoFocus
                  />
                  <div
                    className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
                      opacity: 0.5,
                    }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label className="block text-[10px] text-white/40 uppercase tracking-[0.2em] mb-2 font-medium">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/30 rounded-xl text-white text-sm py-3 px-4 pr-10 focus:outline-none transition-all duration-300 placeholder:text-white/20"
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                    }}
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <div
                    className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
                      opacity: 0.5,
                    }}
                  />
                </div>
              </div>

              {/* Sign In button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 rounded-xl font-semibold text-sm text-white relative overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                  boxShadow: '0 4px 24px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                {/* Button gloss highlight */}
                <div
                  className="absolute top-0 left-0 right-0 h-1/2 rounded-t-xl pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.15), transparent)' }}
                />
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </motion.button>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-5 border-t border-white/[0.06]">
              <p className="text-[11px] text-white/30 text-center font-mono">
                <span className="text-cyan-400/70">| YESI-FZCO |</span>
              </p>
              <p className="text-[10px] text-white/20 text-center mt-1 font-mono">
                Warehouse Fulfillment Tool
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
