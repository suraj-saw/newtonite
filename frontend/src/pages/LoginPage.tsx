/**
 * LoginPage Component
 *
 * Authentication portal supporting both credential sign-in and new operator account registration.
 *
 * Security & Lifecycle Patterns:
 * 1. Dual-Mode Form:
 *    - In "Sign In" mode: Sends email and password to `/auth/login`, which issues an HTTP-only
 *      JWT cookie (`access_token`) and increments the user's `session_version`.
 *    - In "Sign Up" mode: Registers name, email, password, and optional initial team assignment
 *      via `/auth/signup`, followed by immediate automatic authentication.
 * 2. Administrative Approval State:
 *    - Unapproved accounts (if configured) receive clear user-facing error feedback if login is attempted
 *      prior to verification by an administrator.
 * 3. Client State Initialization:
 *    - On successful authentication, fetches `/auth/me` and sets authenticated user state in Zustand,
 *      which triggers `localStorage.newtonite_is_logged_in` syncing for cross-tab session coherence.
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import type { User, Team } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

/**
 * Validation schema for the login/signup form.
 */
const schema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, "Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  team_id: z.string().optional().transform(v => v ? parseInt(v, 10) : undefined),
});

type Form = z.infer<typeof schema>;

/**
 * Login and registration card component.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "" } });

  useEffect(() => {
    api.get<Team[]>("/auth/teams").then(setTeams).catch(() => {});
  }, []);

  async function onSubmit(values: Form) {
    try {
      if (!isLogin) {
        await api.post("/auth/signup", { 
          name: values.name || values.email.split("@")[0], 
          email: values.email, 
          password: values.password,
          team_id: values.team_id
        });
        toast.success("Account created! Logging in...");
      }
      
      await api.post("/auth/login", { email: values.email, password: values.password });
      setAuth(null);
      const me = await api.get<User>("/auth/me");
      setAuth(me);
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl shadow-slate-200/50 border-slate-200/60 bg-white/90 backdrop-blur-sm transition-all">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Newtonite</h1>
          <p className="text-sm text-slate-500">
            {isLogin ? "Sign in to coordinate operational work" : "Create an account to get started"}
          </p>
        </div>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          {!isLogin && (
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <Input 
                id="name" 
                className="w-full transition-all focus:ring-2 focus:ring-primary/20"
                placeholder="John Doe"
                {...form.register("name")} 
              />
              {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <Input 
              id="email" 
              className="w-full transition-all focus:ring-2 focus:ring-primary/20"
              placeholder="name@example.com"
              {...form.register("email")} 
            />
            {form.formState.errors.email && <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>}
          </div>
          {!isLogin && teams.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="team_id" className="block text-sm font-medium text-slate-700">
                Assigned Team (Optional)
              </label>
              <select
                id="team_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all focus:ring-primary/20"
                {...form.register("team_id")}
              >
                <option value="">Select a team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.team_id && <p className="text-xs text-red-500">{form.formState.errors.team_id.message}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
            </div>
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"}
                className="w-full transition-all focus:ring-2 focus:ring-primary/20 pr-10" 
                placeholder="••••••••"
                {...form.register("password")} 
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.formState.errors.password && <p className="text-xs text-red-500">{form.formState.errors.password.message}</p>}
          </div>
          <Button 
            type="submit" 
            className="w-full bg-primary hover:bg-primary/90 text-white font-medium shadow-sm transition-all" 
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting 
              ? (isLogin ? "Signing in..." : "Signing up...") 
              : (isLogin ? "Sign in" : "Sign up")}
          </Button>
        </form>
        <div className="mt-8 text-center text-sm">
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}
