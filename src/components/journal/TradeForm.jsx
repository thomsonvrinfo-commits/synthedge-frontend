import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { uploadFile } from "@/api/uploads";
import { createTrade, updateTrade } from "@/api/trades";
import { X, Upload, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackLifecycleEvent } from "@/lib/lifecycleEvents";

const INDICES = [
  "Volatility 10", "Volatility 25", "Volatility 50", "Volatility 75", "Volatility 100",
  "Volatility 10 (1s)", "Volatility 25 (1s)", "Volatility 50 (1s)", "Volatility 75 (1s)", "Volatility 100 (1s)",
  "Boom 300", "Boom 500", "Boom 1000",
  "Crash 300", "Crash 500", "Crash 1000",
  "Jump 10", "Jump 25", "Jump 50", "Jump 75", "Jump 100",
  "Step Index", "Range Break 100", "Range Break 200"
];
const EMOTIONS = ["Calm", "Confident", "Anxious", "FOMO", "Revenge", "Frustrated", "Excited", "Neutral", "Fearful", "Overconfident"];
const SESSIONS = ["London", "New York", "Asian", "Sydney", "Overlap"];

const blank = () => ({
  synthetic_index: "", direction: "", entry_price: "", exit_price: "",
  stop_loss: "", take_profit: "", lot_size: "", stake: "", result: "", strategy: "",
  emotional_state: "", confidence_level: 7, session: "", notes: "",
  trade_reasoning: "", market_conditions: "", mistakes_made: "",
  lessons_learned: "", execution_rating: 7, rule_violations: [],
  screenshot_before: "", screenshot_during: "", screenshot_after: "",
  custom_fields: {}, trade_date: new Date().toISOString().slice(0, 16), source: "journal",
});

function ScreenshotUpload({ label, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploadFile(file);
    onChange(file_url);
    setUploading(false);
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">
        {value ? (
          <div className="relative">
            <img src={value} alt={label} className="w-full h-28 object-cover rounded-lg border border-border" />
            <button type="button" onClick={() => onChange("")} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-1 h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
            <span className="text-[10px] text-muted-foreground">{uploading ? "Uploading…" : "Upload"}</span>
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
        )}
      </div>
    </div>
  );
}

export default function TradeForm({ open, onClose, onSaved, editTrade, profile, rules, inline = false }) {
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [activeViolations, setActiveViolations] = useState([]);

  const strategies = profile?.custom_strategies?.length ? profile.custom_strategies : [];
  const customFields = profile?.custom_fields || [];

  useEffect(() => {
    if (editTrade) {
      setForm({
        ...blank(),
        ...editTrade,
        entry_price: editTrade.entry_price ?? "",
        exit_price: editTrade.exit_price ?? "",
        stop_loss: editTrade.stop_loss ?? "",
        take_profit: editTrade.take_profit ?? "",
        lot_size: editTrade.lot_size ?? "",
        stake: editTrade.stake ?? "",
        confidence_level: editTrade.confidence_level ?? 7,
        execution_rating: editTrade.execution_rating ?? 7,
        rule_violations: editTrade.rule_violations ?? [],
        custom_fields: editTrade.custom_fields ?? {},
        trade_date: editTrade.trade_date ? editTrade.trade_date.slice(0, 16) : new Date().toISOString().slice(0, 16),
      });
      setActiveViolations(editTrade.rule_violations ?? []);
    } else {
      setForm(blank());
      setActiveViolations([]);
    }
  }, [editTrade, open]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const calcRR = () => {
    const e = parseFloat(form.entry_price), sl = parseFloat(form.stop_loss), tp = parseFloat(form.take_profit);
    if (!e || !sl || !tp) return null;
    const risk = Math.abs(e - sl), reward = Math.abs(tp - e);
    return risk > 0 ? (reward / risk).toFixed(2) : null;
  };

  const calcPL = () => {
    const e = parseFloat(form.entry_price), ex = parseFloat(form.exit_price);
    const stakeAmt = parseFloat(form.stake || form.lot_size) || 0;
    if (!e || !ex || stakeAmt === 0) return null;
    const diff = form.direction === "Buy" ? ex - e : e - ex;
    return (diff * stakeAmt).toFixed(2);
  };

  const toggleViolation = (v) => {
    const next = activeViolations.includes(v) ? activeViolations.filter(x => x !== v) : [...activeViolations, v];
    setActiveViolations(next);
    set("rule_violations", next);
  };

  const setCustomField = (id, value) => {
    set("custom_fields", { ...form.custom_fields, [id]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const rr = calcRR(); const pl = calcPL();
    const tradeData = {
      ...form,
      entry_price: parseFloat(form.entry_price) || 0,
      exit_price: form.exit_price ? parseFloat(form.exit_price) : undefined,
      stop_loss: form.stop_loss ? parseFloat(form.stop_loss) : undefined,
      take_profit: form.take_profit ? parseFloat(form.take_profit) : undefined,
      lot_size: form.lot_size ? parseFloat(form.lot_size) : undefined,
      stake: form.stake ? parseFloat(form.stake) : undefined,
      risk_reward_ratio: rr ? parseFloat(rr) : undefined,
      profit_loss: pl ? parseFloat(pl) : undefined,
      confidence_level: form.confidence_level,
      execution_rating: form.execution_rating,
      trade_date: form.trade_date ? new Date(form.trade_date).toISOString() : new Date().toISOString(),
    };
    if (editTrade) {
      await updateTrade(editTrade.id, tradeData);
    } else {
      await createTrade(tradeData);
      trackLifecycleEvent("TRADE_CREATED");
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  const dirBtn = (d) => (
    <Button key={d} type="button" size="sm" onClick={() => set("direction", d)}
      className={cn("flex-1 text-xs",
        form.direction === d && d === "Buy" ? "bg-success hover:bg-success/90 text-white" :
        form.direction === d && d === "Sell" ? "bg-destructive hover:bg-destructive/90 text-white" :
        "variant-outline"
      )}
      variant={form.direction === d ? "default" : "outline"}
    >{d}</Button>
  );

  const formContent = (
    <form onSubmit={handleSubmit}>
      <Tabs defaultValue="entry" className={inline ? "" : "p-5"}>
            <TabsList className="bg-secondary mb-5 w-full">
              <TabsTrigger value="entry" className="flex-1 text-xs">Entry</TabsTrigger>
              <TabsTrigger value="context" className="flex-1 text-xs">Context</TabsTrigger>
              <TabsTrigger value="review" className="flex-1 text-xs">Review</TabsTrigger>
              {customFields.length > 0 && <TabsTrigger value="custom" className="flex-1 text-xs">Checklist</TabsTrigger>}
              <TabsTrigger value="screenshots" className="flex-1 text-xs">Screenshots</TabsTrigger>
            </TabsList>

            {/* Entry Tab */}
            <TabsContent value="entry" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Synthetic Index</Label>
                  <Select value={form.synthetic_index} onValueChange={v => set("synthetic_index", v)}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue placeholder="Select index" /></SelectTrigger>
                    <SelectContent>{INDICES.map(i => <SelectItem key={i} value={i} className="text-xs">{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Direction</Label>
                  <div className="flex gap-2 mt-1">{["Buy", "Sell"].map(dirBtn)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[["Entry Price", "entry_price"], ["Exit Price", "exit_price"], ["Stop Loss", "stop_loss"], ["Take Profit", "take_profit"]].map(([label, field]) => (
                  <div key={field}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input type="number" step="any" value={form[field]} onChange={e => set(field, e.target.value)} className="bg-secondary border-border font-mono text-sm mt-1" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Lot Size</Label>
                  <Input type="number" step="any" value={form.lot_size} onChange={e => set("lot_size", e.target.value)} className="bg-secondary border-border font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Stake / Amount ($)</Label>
                  <Input type="number" step="any" min="0" value={form.stake} onChange={e => set("stake", e.target.value)} placeholder="e.g. 10.00" className="bg-secondary border-border font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Result</Label>
                  <Select value={form.result} onValueChange={v => set("result", v)}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue placeholder="Result" /></SelectTrigger>
                    <SelectContent>{["Win", "Loss", "Breakeven"].map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">R:R Ratio</Label>
                  <Input value={calcRR() || "—"} disabled className="bg-secondary/50 border-border font-mono text-sm mt-1 text-muted-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Strategy / Setup</Label>
                  <Select value={form.strategy} onValueChange={v => set("strategy", v)}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue placeholder="Select setup" /></SelectTrigger>
                    <SelectContent>
                      {strategies.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Or type a custom setup…" value={strategies.includes(form.strategy) ? "" : form.strategy} onChange={e => set("strategy", e.target.value)} className="bg-secondary border-border font-mono text-xs mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Date & Time</Label>
                  <Input type="datetime-local" value={form.trade_date} onChange={e => set("trade_date", e.target.value)} className="bg-secondary border-border text-sm mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Quick observations…" className="bg-secondary border-border h-16 resize-none text-sm mt-1" />
              </div>
            </TabsContent>

            {/* Context Tab */}
            <TabsContent value="context" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Emotional State</Label>
                  <Select value={form.emotional_state} onValueChange={v => set("emotional_state", v)}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue placeholder="How were you feeling?" /></SelectTrigger>
                    <SelectContent>{EMOTIONS.map(e => <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Session</Label>
                  <Select value={form.session} onValueChange={v => set("session", v)}>
                    <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue placeholder="Session" /></SelectTrigger>
                    <SelectContent>{SESSIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Confidence Level: {form.confidence_level}/10</Label>
                <Slider value={[form.confidence_level]} min={1} max={10} step={1} onValueChange={([v]) => set("confidence_level", v)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Trade Reasoning</Label>
                <Textarea value={form.trade_reasoning} onChange={e => set("trade_reasoning", e.target.value)} placeholder="Why did you take this trade? What was the setup?" className="bg-secondary border-border h-24 resize-none text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Market Conditions</Label>
                <Textarea value={form.market_conditions} onChange={e => set("market_conditions", e.target.value)} placeholder="HTF bias, key levels, session context…" className="bg-secondary border-border h-20 resize-none text-sm mt-1" />
              </div>

              {/* Rule Violations */}
              {rules && rules.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Rule Violations (select all that apply)</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {rules.filter(r => r.is_active !== false).map(rule => (
                      <div key={rule.id || rule.title} className="flex items-center gap-2">
                        <Checkbox
                          checked={activeViolations.includes(rule.title)}
                          onCheckedChange={() => toggleViolation(rule.title)}
                          className="border-border"
                        />
                        <label className="text-xs cursor-pointer">{rule.title}</label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Review Tab */}
            <TabsContent value="review" className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Execution Rating: {form.execution_rating}/10</Label>
                <Slider value={[form.execution_rating]} min={1} max={10} step={1} onValueChange={([v]) => set("execution_rating", v)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mistakes Made</Label>
                <Textarea value={form.mistakes_made} onChange={e => set("mistakes_made", e.target.value)} placeholder="What mistakes did you make?" className="bg-secondary border-border h-24 resize-none text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Lessons Learned</Label>
                <Textarea value={form.lessons_learned} onChange={e => set("lessons_learned", e.target.value)} placeholder="What will you do differently next time?" className="bg-secondary border-border h-24 resize-none text-sm mt-1" />
              </div>
            </TabsContent>

            {/* Custom Fields Tab */}
            {customFields.length > 0 && (
              <TabsContent value="custom" className="space-y-4">
                {customFields.map(field => (
                  <div key={field.id}>
                    <Label className="text-xs text-muted-foreground">{field.label}</Label>
                    {field.type === "checkbox" && (
                      <div className="flex items-center gap-2 mt-1">
                        <Checkbox
                          checked={!!form.custom_fields[field.label]}
                          onCheckedChange={v => setCustomField(field.label, v)}
                        />
                        <span className="text-sm">{field.label}</span>
                      </div>
                    )}
                    {field.type === "text" && (
                      <Input value={form.custom_fields[field.label] || ""} onChange={e => setCustomField(field.label, e.target.value)} className="bg-secondary border-border text-sm mt-1" />
                    )}
                    {field.type === "number" && (
                      <Input type="number" value={form.custom_fields[field.label] || ""} onChange={e => setCustomField(field.label, e.target.value)} className="bg-secondary border-border font-mono text-sm mt-1" />
                    )}
                    {field.type === "dropdown" && field.options?.length > 0 && (
                      <Select value={form.custom_fields[field.label] || ""} onValueChange={v => setCustomField(field.label, v)}>
                        <SelectTrigger className="bg-secondary border-border mt-1 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{field.options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </TabsContent>
            )}

            {/* Screenshots Tab */}
            <TabsContent value="screenshots" className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <ScreenshotUpload label="Before Trade" value={form.screenshot_before} onChange={v => set("screenshot_before", v)} />
                <ScreenshotUpload label="During Trade" value={form.screenshot_during} onChange={v => set("screenshot_during", v)} />
                <ScreenshotUpload label="After Trade" value={form.screenshot_after} onChange={v => set("screenshot_after", v)} />
              </div>
            </TabsContent>
          </Tabs>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving || !form.synthetic_index || !form.direction || !form.result}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {editTrade ? "Update Trade" : "Log Trade"}
        </Button>
      </div>
    </form>
  );

  if (inline) return formContent;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-card border-border p-0">
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle>{editTrade ? "Edit Trade" : "Log New Trade"}</DialogTitle>
        </DialogHeader>
        <div className="p-5">{formContent}</div>
      </DialogContent>
    </Dialog>
  );
}
