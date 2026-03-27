import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Icon from "../../components/AppIcon";
import { buildApiUrl } from "../../utils/api";
import { getFriendlyAuthErrorMessage } from "../../utils/authErrors";

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Login failed");
      }
      const role = data?.user?.role || "customer";
      localStorage.setItem("authToken", data?.token);
      localStorage.setItem("userId", data?.user?.id || "");
      localStorage.setItem("userRole", role);
      localStorage.setItem("userName", data?.user?.fullName || "User");
      const dashboardPath = role === "admin"
        ? "/admin-dashboard"
        : role === "courier"
          ? "/courier-dashboard"
          : "/user-dashboard";
      navigate(dashboardPath);
    } catch (err) {
      setError(getFriendlyAuthErrorMessage(err?.message, "login"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card shadow-elevation-lg rounded-2xl p-6 md:p-8 border border-border">
        <div className="mb-4">
          <Link to="/landing-page" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <Icon name="ArrowLeft" size={16} />
            <span>Back to Home</span>
          </Link>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="LogIn" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Welcome Back</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) => handleChange("email", e?.target?.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={(e) => handleChange("password", e?.target?.value)}
            required
          />

          {error && (
            <div className="text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="default"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={isSubmitting}
            iconName="LogIn"
            iconPosition="left"
          >
            Sign In
          </Button>
        </form>

        <div className="mt-6 text-sm text-muted-foreground text-center">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
