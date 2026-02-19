import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, Eye, EyeOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { authLogin, initializeMe, setSession } from "@/lib/api";

const LoginPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const login = await authLogin({
        email: formData.email,
        password: formData.password,
      });
      setSession({ token: login.accessToken });
      await initializeMe();
      setLoading(false);
      toast.success("Welcome back! Select your project...");
      navigate("/projects", { replace: true });
      setTimeout(() => {
        if (window.location.pathname !== "/projects") {
          window.location.assign("/projects");
        }
      }, 120);
    } catch {
      setLoading(false);
      toast.error("Login failed. Check email/password.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex" data-testid="login-page">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-8" data-testid="login-logo">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <span className="font-heading font-bold text-2xl text-slate-900">Textzy</span>
          </Link>

          <Card className="border-slate-200 shadow-card">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-heading">Welcome back</CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    data-testid="login-email-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      data-testid="login-password-input"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="toggle-password-btn"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={formData.rememberMe}
                      onCheckedChange={(checked) => setFormData({ ...formData, rememberMe: checked })}
                      data-testid="remember-me-checkbox"
                    />
                    <label htmlFor="remember" className="text-sm text-slate-600 cursor-pointer">
                      Remember me
                    </label>
                  </div>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                    data-testid="forgot-password-link"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11"
                  disabled={loading}
                  data-testid="login-submit-btn"
                >
                  {loading ? "Signing in..." : "Sign In"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-2 text-slate-500">Or continue with</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Button variant="outline" className="h-11" data-testid="google-login-btn">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </Button>
                  <Button variant="outline" className="h-11" data-testid="microsoft-login-btn">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                      <path fill="#F25022" d="M1 1h10v10H1z"/>
                      <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                      <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                      <path fill="#FFB900" d="M13 13h10v10H13z"/>
                    </svg>
                    Microsoft
                  </Button>
                </div>
              </div>

              <p className="mt-6 text-center text-sm text-slate-600">
                Don't have an account?{" "}
                <Link to="/register" className="text-orange-500 hover:text-orange-600 font-medium" data-testid="register-link">
                  Sign up for free
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Side - Visual */}
      <div className="hidden lg:flex flex-1 bg-slate-900 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-20">
          <img
            src="https://images.pexels.com/photos/8867376/pexels-photo-8867376.jpeg"
            alt="Office environment"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative z-10 text-center max-w-lg">
          <div className="w-20 h-20 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <MessageSquare className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-heading font-bold text-white mb-4">
            Connect with millions of customers
          </h2>
          <p className="text-slate-400 text-lg">
            Join thousands of Indian businesses using Textzy to engage customers on WhatsApp and SMS.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-6">
            <div>
              <p className="text-3xl font-bold text-orange-500">10M+</p>
              <p className="text-slate-400 text-sm">Messages Daily</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-orange-500">5K+</p>
              <p className="text-slate-400 text-sm">Active Users</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-orange-500">99.9%</p>
              <p className="text-slate-400 text-sm">Uptime</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
