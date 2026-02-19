import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Building2, CircleDot, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { authProjects, createProject, getSession, switchProject } from "@/lib/api";

export default function ProjectSelectPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [switchingSlug, setSwitchingSlug] = useState("");

  const session = getSession();

  useEffect(() => {
    if (!session.token) {
      navigate("/login", { replace: true });
      return;
    }

    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await authProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const slides = useMemo(() => {
    if (!projects.length) return [{ name: "Create your first project", role: "owner", slug: "first" }];
    return projects.slice(0, 3);
  }, [projects]);

  const onCreate = async () => {
    const next = name.trim();
    if (!next) {
      toast.error("Enter project name");
      return;
    }

    setCreating(true);
    try {
      await createProject(next);
      toast.success("Project created");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const onView = async (slug) => {
    setSwitchingSlug(slug);
    try {
      await switchProject(slug);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e.message || "Failed to switch project");
    } finally {
      setSwitchingSlug("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.3),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.2),transparent_40%)]" />
      <div className="relative z-10 px-6 py-10 lg:px-16">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 items-center min-h-[78vh]">
          <div className="text-white space-y-6">
            <p className="text-4xl font-bold">Welcome {session.email?.split("@")[0] || "User"}..!</p>
            <h1 className="text-5xl lg:text-7xl font-heading font-bold leading-tight">Achieve Design Excellence</h1>
            <p className="text-slate-300 text-lg max-w-xl">One Business Project is associated with one WhatsApp Business API Number</p>

            <div className="space-y-4 max-w-2xl">
              <div className="relative">
                <UserCircle2 className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter Your Project Name"
                  className="h-14 pl-12 rounded-full border-white/20 bg-white/10 text-white placeholder:text-slate-300"
                />
              </div>
              <Button onClick={onCreate} disabled={creating} className="w-full h-14 rounded-full text-xl bg-orange-500 hover:bg-orange-600 text-white">
                {creating ? "Creating..." : "Create new"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {slides.map((p, idx) => (
                <Card key={`${p.slug}-${idx}`} className={`rounded-3xl border-white/20 ${idx === 1 ? "bg-white text-slate-900 scale-105 shadow-2xl shadow-orange-500/20" : "bg-white/10 text-white"}`}>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${idx === 1 ? "bg-slate-100" : "bg-white/20"}`}>
                        <Building2 className={`w-6 h-6 ${idx === 1 ? "text-slate-700" : "text-white"}`} />
                      </div>
                      <div className="font-semibold text-2xl leading-tight">{p.name}</div>
                    </div>
                    <div className={`border-t border-dashed ${idx === 1 ? "border-slate-300" : "border-white/30"}`} />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className={`text-sm ${idx === 1 ? "text-slate-500" : "text-slate-300"}`}>Status</p>
                        <p className="font-semibold">Created</p>
                      </div>
                      <div>
                        <p className={`text-sm ${idx === 1 ? "text-slate-500" : "text-slate-300"}`}>Active Plan</p>
                        <p className="font-semibold">TRIAL (pro + Flows)</p>
                      </div>
                    </div>
                    <p className={idx === 1 ? "text-slate-600" : "text-slate-200"}>Created at Feb 6, 2025</p>
                    <Button
                      onClick={() => onView(p.slug)}
                      disabled={switchingSlug === p.slug || loading || p.slug === "first"}
                      className="w-full rounded-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {switchingSlug === p.slug ? "Opening..." : "View"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((x) => <CircleDot key={x} className={`w-4 h-4 ${x === 1 ? "text-white" : "text-white/40"}`} />)}
            </div>

            {!loading && !!projects.length && (
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <Badge key={p.slug} className="bg-white/20 text-white hover:bg-white/30 rounded-full px-3 py-1 cursor-pointer" onClick={() => onView(p.slug)}>
                    {p.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
