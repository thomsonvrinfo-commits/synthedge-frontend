import React, { useState, useEffect } from "react";
import { getMyProfileAsList, createProfile, updateProfile } from "@/api/profile";
import { listTradingRules, createTradingRule, updateTradingRule, deleteTradingRule } from "@/api/tradingRules";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus, Save, Target, Loader2, Trash2, Code2, ShieldCheck } from "lucide-react";
import { useProAccess } from "@/hooks/useProAccess";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ALL_GOALS, GOAL_DEFINITIONS, DEFAULT_STRATEGIES, DEFAULT_RULES } from "@/lib/traderUtils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ConnectedAccounts from "@/components/settings/ConnectedAccounts";

const FIELD_TYPES = [
  { value: "checkbox", label: "Checkbox (Yes/No)" },
  { value: "text", label: "Text Input" },
  { value: "number", label: "Number" },
  { value: "dropdown", label: "Dropdown" },
];

const RULE_CATEGORIES = ["Risk Management", "Entry Rules", "Exit Rules", "Session Rules", "Psychology", "Trade Management"];

function GoalSelector({ selected, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {ALL_GOALS.map(goal => {
        const def = GOAL_DEFINITIONS[goal];
        const active = selected.includes(goal);
        return (
          <button
            key={goal}
            type="button"
            onClick={() => onChange(active ? selected.filter(g => g !== goal) : [...selected, goal])}
            className={cn(
              "flex items-start gap-2 p-3 rounded-xl border text-left transition-all",
              active ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-border/80"
            )}
          >
            <span className="text-lg flex-shrink-0">{def.icon}</span>
            <div>
              <p className={cn("text-xs font-semibold", active ? "text-primary" : "text-foreground")}>{goal}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{def.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { isDeveloper, isAdmin } = useProAccess();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [newStrategy, setNewStrategy] = useState("");
  const [newField, setNewField] = useState({ label: "", type: "checkbox", options: "" });
  const [newRule, setNewRule] = useState({ title: "", category: "Risk Management", description: "" });

  const { data: profiles = [] } = useQuery({
    queryKey: ["traderProfile", user?.id],
    queryFn: getMyProfileAsList,
    enabled: !!user?.id,
  });
  const { data: rules = [], refetch: refetchRules } = useQuery({
    queryKey: ["tradingRules", user?.id],
    queryFn: () => listTradingRules({ limit: 50 }),
    enabled: !!user?.id,
    initialData: [],
  });

  const profile = profiles[0] || {};
  const [form, setForm] = useState({
    goals: [],
    custom_strategies: DEFAULT_STRATEGIES.slice(),
    custom_fields: [],
    account_size: "",
    risk_per_trade: "",
    max_daily_trades: "",
    preferred_sessions: [],
    display_name: "",
  });

  useEffect(() => {
    if (profile.id) {
      setForm({
        goals: profile.goals || [],
        custom_strategies: profile.custom_strategies?.length ? profile.custom_strategies : DEFAULT_STRATEGIES.slice(),
        custom_fields: profile.custom_fields || [],
        account_size: profile.account_size || "",
        risk_per_trade: profile.risk_per_trade || "",
        max_daily_trades: profile.max_daily_trades || "",
        preferred_sessions: profile.preferred_sessions || [],
        display_name: profile.display_name || "",
      });
    }
  }, [profile.id]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const saveProfile = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        account_size: form.account_size ? parseFloat(form.account_size) : undefined,
        risk_per_trade: form.risk_per_trade ? parseFloat(form.risk_per_trade) : undefined,
        max_daily_trades: form.max_daily_trades ? parseInt(form.max_daily_trades) : undefined,
      };
      if (profile.id) {
        await updateProfile(data);
      } else {
        await createProfile(data);
      }
      queryClient.invalidateQueries({ queryKey: ["traderProfile"] });
      toast.success("Profile saved!");
    } catch (err) {
      console.error("saveProfile error:", err);
      toast.error("Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const addStrategy = () => {
    if (!newStrategy.trim()) return;
    set("custom_strategies", [...form.custom_strategies, newStrategy.trim()]);
    setNewStrategy("");
  };
  const removeStrategy = (s) => set("custom_strategies", form.custom_strategies.filter(x => x !== s));

  const addField = () => {
    if (!newField.label.trim()) return;
    const opts = newField.options ? newField.options.split(",").map(s => s.trim()).filter(Boolean) : [];
    set("custom_fields", [...form.custom_fields, {
      id: Date.now().toString(),
      label: newField.label.trim(),
      type: newField.type,
      options: opts,
    }]);
    setNewField({ label: "", type: "checkbox", options: "" });
  };
  const removeField = (id) => set("custom_fields", form.custom_fields.filter(f => f.id !== id));

  const addRule = async () => {
    if (!newRule.title.trim()) return;
    await createTradingRule({ ...newRule, is_active: true, violation_count: 0 });
    refetchRules();
    setNewRule({ title: "", category: "Risk Management", description: "" });
  };
  const deleteRule = async (id) => {
    await deleteTradingRule(id);
    refetchRules();
  };
  const toggleRule = async (rule) => {
    await updateTradingRule(rule.id, { is_active: !rule.is_active });
    refetchRules();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Customize your trading environment</p>
        </div>
        <Button onClick={saveProfile} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="goals">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="strategies">Setups</TabsTrigger>
          <TabsTrigger value="fields">Checklist</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="broker">Broker</TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-1.5">
          Account
          {(isDeveloper || isAdmin) && (
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded",
              isDeveloper ? "bg-primary/20 text-primary" : "bg-warning/20 text-warning"
            )}>
              {isDeveloper ? "DEV" : "ADMIN"}
            </span>
          )}
        </TabsTrigger>
        </TabsList>

        {/* Goals */}
        <TabsContent value="goals" className="space-y-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-1">Improvement Goals</h3>
            <p className="text-xs text-muted-foreground mb-4">Select what you want to focus on. The AI and dashboard will adapt to your goals.</p>
            <GoalSelector selected={form.goals} onChange={v => set("goals", v)} />
            {form.goals.length > 0 && (
              <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-xs text-primary font-medium">Active goals: {form.goals.join(", ")}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Strategies */}
        <TabsContent value="strategies" className="space-y-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Strategy Tags</h3>
            <div className="flex flex-wrap gap-2">
              {form.custom_strategies.map(s => (
                <div key={s} className="flex items-center gap-1 px-2.5 py-1 bg-secondary rounded-full border border-border text-xs">
                  {s}
                  <button type="button" onClick={() => removeStrategy(s)} className="text-muted-foreground hover:text-foreground ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newStrategy} onChange={e => setNewStrategy(e.target.value)} onKeyDown={e => e.key === "Enter" && addStrategy()} placeholder="Add new strategy…" className="bg-secondary border-border text-sm" />
              <Button type="button" onClick={addStrategy} size="sm" variant="outline" className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Custom Fields */}
        <TabsContent value="fields" className="space-y-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Custom Journal Checklist</h3>
            <p className="text-xs text-muted-foreground">Add custom fields that appear in your trade log form.</p>
            {form.custom_fields.length > 0 && (
              <div className="space-y-2">
                {form.custom_fields.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border">
                    <div>
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">({f.type})</span>
                      {f.options?.length > 0 && <span className="text-xs text-muted-foreground ml-1">· {f.options.join(", ")}</span>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeField(f.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground">Add new field</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Field Name</Label>
                  <Input value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} placeholder="e.g. HTF Bias, BOS Confirmed" className="bg-secondary border-border text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Field Type</Label>
                  <Select value={newField.type} onValueChange={v => setNewField(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {newField.type === "dropdown" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Options (comma-separated)</Label>
                  <Input value={newField.options} onChange={e => setNewField(p => ({ ...p, options: e.target.value }))} placeholder="Option 1, Option 2, Option 3" className="bg-secondary border-border text-sm mt-1" />
                </div>
              )}
              <Button type="button" onClick={addField} size="sm" variant="outline" className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Field
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Trading Rules</h3>
            <p className="text-xs text-muted-foreground">Define your personal trading rules. You can mark violations when logging trades.</p>
            {rules.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">No rules yet. Add your trading rules below.</p>
                <Button variant="outline" size="sm" onClick={() => {
                  DEFAULT_RULES.forEach(r => createTradingRule({ ...r, is_active: true, violation_count: 0 }));
                  setTimeout(() => refetchRules(), 500);
                }}>
                  Load Default Rules
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className={cn("flex items-center justify-between p-3 rounded-lg border", rule.is_active ? "bg-secondary/50 border-border" : "bg-secondary/20 border-border/40 opacity-60")}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{rule.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rule.category}</Badge>
                      {rule.violation_count > 0 && (
                        <span className="text-[10px] text-destructive">{rule.violation_count} violation{rule.violation_count > 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.is_active !== false} onCheckedChange={() => toggleRule(rule)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground">Add rule</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Rule</Label>
                  <Input value={newRule.title} onChange={e => setNewRule(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Max 3 trades per day" className="bg-secondary border-border text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select value={newRule.category} onValueChange={v => setNewRule(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="button" onClick={addRule} size="sm" variant="outline" className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Rule
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Broker */}
        <TabsContent value="broker" className="space-y-4 mt-4">
          <ConnectedAccounts />
        </TabsContent>

        {/* Account */}
        <TabsContent value="account" className="space-y-4 mt-4">
          {isDeveloper && (
            <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl">
              <Code2 className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary">Developer Access Enabled</p>
                <p className="text-xs text-muted-foreground">All Pro features are unlocked for development & testing. Payment requirements are bypassed.</p>
              </div>
            </div>
          )}
          {isAdmin && !isDeveloper && (
            <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-warning flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning">Admin Account</p>
                <p className="text-xs text-muted-foreground">All Pro features are unlocked via admin privileges.</p>
              </div>
            </div>
          )}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">Account Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Display Name</Label>
                <Input value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="Your name" className="bg-secondary border-border text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Account Size ($)</Label>
                <Input type="number" value={form.account_size} onChange={e => set("account_size", e.target.value)} placeholder="10000" className="bg-secondary border-border font-mono text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max Risk Per Trade (%)</Label>
                <Input type="number" step="0.1" value={form.risk_per_trade} onChange={e => set("risk_per_trade", e.target.value)} placeholder="1" className="bg-secondary border-border font-mono text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max Daily Trades</Label>
                <Input type="number" value={form.max_daily_trades} onChange={e => set("max_daily_trades", e.target.value)} placeholder="3" className="bg-secondary border-border font-mono text-sm mt-1" />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}