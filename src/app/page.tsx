"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Plus,
  Search,
  Cake,
  Calendar,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Tag,
  Trash2,
  Pencil,
  Sparkles,
  MessageSquare,
  Clock,
  ArrowRight,
  User,
  ListChecks,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ---------- Types (mirror the API route handlers) ----------

interface ContactListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  birthday: string | null;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  interactionCount: number;
  lastInteractionAt: string | null;
}

interface Interaction {
  id: string;
  contactId: string;
  type: string;
  summary: string;
  occurredAt: string;
  createdAt: string;
}

interface FollowUpDraft {
  id: string;
  contactId: string;
  tonePreset: string;
  content: string;
  createdAt: string;
}

interface RecapData {
  keywords: string[];
  summary: string;
  interactionCount: number;
  dateRange: { from?: string; to?: string };
  narrative?: string;
  source: "pure" | "llm";
}

interface BirthdayAlert {
  contact: { id: string; name: string; birthday: string };
  birthday: string;
  daysUntil: number;
  turningAge: number | null;
}

interface MilestoneAlert {
  contact: { id: string; name: string };
  interactionCount: number;
  nextMilestone: number;
  interactionsUntil: number;
}

interface AlertsData {
  birthdays: BirthdayAlert[];
  milestones: MilestoneAlert[];
}

const INTERACTION_TYPES = ["meeting", "call", "email", "note", "other"] as const;
type InteractionType = (typeof INTERACTION_TYPES)[number];

const TONE_OPTIONS = [
  { id: "casual", label: "Casual" },
  { id: "formal", label: "Formal" },
  { id: "warm", label: "Warm" },
];

// ---------- Helpers ----------

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return iso;
  }
}

function relativeDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${Math.abs(n)} days ago`;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function typeColor(t: string): "default" | "secondary" | "destructive" | "outline" {
  switch (t) {
    case "meeting": return "default";
    case "call": return "secondary";
    case "email": return "outline";
    case "note": return "outline";
    default: return "secondary";
  }
}

// ---------- Main Page ----------

export default function Page() {
  const { toast } = useToast();

  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactListItem | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [drafts, setDrafts] = useState<FollowUpDraft[]>([]);
  const [recap, setRecap] = useState<RecapData | null>(null);

  const [alerts, setAlerts] = useState<AlertsData | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const [tab, setTab] = useState<"info" | "timeline" | "followups">("info");
  const [tone, setTone] = useState<string>("casual");
  const [useLlmRecap, setUseLlmRecap] = useState(false);

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const c of contacts) for (const t of c.tags) s.add(t);
    return Array.from(s).sort();
  }, [contacts]);

  // ---------- Fetchers ----------

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query.trim()) qs.set("q", query.trim());
      if (tagFilter) qs.set("tag", tagFilter);
      const res = await fetch(`/api/contacts?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ContactListItem[];
      setContacts(data);
    } catch (e) {
      toast({ title: "Failed to load contacts", description: (e as Error).message, variant: "destructive" });
    } finally {
      setContactsLoading(false);
    }
  }, [query, tagFilter, toast]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AlertsData;
      setAlerts(data);
    } catch (e) {
      // alerts are non-critical; fail silently
      console.warn("[alerts] failed:", e);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const selectContact = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setRecap(null);
    setDrafts([]);
    try {
      const res = await fetch(`/api/contacts/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { contact: ContactListItem; interactions: Interaction[]; drafts: FollowUpDraft[] };
      setDetail(data.contact);
      setInteractions(data.interactions);
      setDrafts(data.drafts);
      setTab("info");
    } catch (e) {
      toast({ title: "Failed to load contact", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  const refreshInteractions = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/contacts/${selectedId}/interactions`);
      if (!res.ok) return;
      const data = (await res.json()) as Interaction[];
      setInteractions(data);
    } catch {
      // ignore
    }
  }, [selectedId]);

  // ---------- Effects ----------

  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  // refresh alerts when contacts change (new contact may have a birthday)
  useEffect(() => { if (!alertsLoading) loadAlerts(); }, [contacts.length, loadAlerts, alertsLoading]);

  // ---------- Actions ----------

  const wrap = (key: string, fn: () => Promise<void>) => async () => {
    setBusy((b) => ({ ...b, [key]: true }));
    try { await fn(); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  const onGenerateFollowUp = wrap("followup", async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/contacts/${selectedId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tonePreset: tone }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { drafts: FollowUpDraft[] };
      setDrafts(data.drafts);
      setTab("followups");
      toast({ title: "Drafts generated", description: `${data.drafts.length} variation${data.drafts.length === 1 ? "" : "s"} ready.` });
    } catch (e) {
      toast({ title: "Follow-up failed", description: (e as Error).message, variant: "destructive" });
    }
  });

  const onGetRecap = wrap("recap", async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/contacts/${selectedId}/recap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useLLM: useLlmRecap }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RecapData;
      setRecap(data);
    } catch (e) {
      toast({ title: "Recap failed", description: (e as Error).message, variant: "destructive" });
    }
  });

  const onDeleteInteraction = async (id: string) => {
    try {
      const res = await fetch(`/api/interactions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInteractions((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Interaction deleted" });
      loadContacts();
      loadAlerts();
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onDeleteContact = async () => {
    if (!selectedId) return;
    if (!confirm("Delete this contact and all their interactions? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/contacts/${selectedId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "Contact deleted" });
      setSelectedId(null);
      setDetail(null);
      setInteractions([]);
      setDrafts([]);
      setRecap(null);
      loadContacts();
      loadAlerts();
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  // ---------- Render ----------

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-sm sm:text-base truncate">Personal CRM with AI Memory</h1>
              <p className="text-xs text-muted-foreground hidden sm:block truncate">Manual contacts · interaction timeline · AI follow-ups · last-talked-about recap · birthday & milestone alerts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NewContactDialog onSaved={() => { loadContacts(); loadAlerts(); }} />
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
        {/* LEFT: alerts + contact list */}
        <aside className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          <AlertsSummary alerts={alerts} loading={alertsLoading} onSelect={selectContact} />
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Contacts</CardTitle>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, company, notes..."
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                {allTags.length > 0 && (
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="Filter by tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All tags</SelectItem>
                      {allTags.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full max-h-[calc(100vh-22rem)] thin-scroll">
                {contactsLoading ? (
                  <div className="px-4 pb-4 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="px-4 pb-6 text-center text-sm text-muted-foreground">
                    No contacts. Click <span className="font-medium">New Contact</span> to add one.
                  </div>
                ) : (
                  <ul className="px-2 pb-2">
                    {contacts.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => selectContact(c.id)}
                          className={`w-full text-left rounded-md px-2 py-2 transition-colors hover:bg-accent ${
                            selectedId === c.id ? "bg-accent" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="size-8 shrink-0">
                              <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm truncate">{c.name}</span>
                                {c.lastInteractionAt && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">{ago(c.lastInteractionAt)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                {c.company && <span className="truncate">{c.company}</span>}
                                <span>·</span>
                                <span>{c.interactionCount} interaction{c.interactionCount === 1 ? "" : "s"}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        {/* CENTER: contact detail */}
        <section className="lg:col-span-6 flex flex-col gap-4 min-h-0">
          {!selectedId || !detail ? (
            <Card className="flex-1 flex items-center justify-center min-h-[60vh]">
              <CardContent className="text-center py-16">
                <User className="size-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Select a contact</p>
                <p className="text-sm text-muted-foreground mt-1">Pick someone from the list to see their profile, interaction timeline, and generate follow-up drafts.</p>
              </CardContent>
            </Card>
          ) : detailLoading ? (
            <Card><CardContent className="space-y-4 py-6"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-40 w-full" /></CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar className="size-12 shrink-0">
                        <AvatarFallback>{initials(detail.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{detail.name}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          {detail.role && <span className="inline-flex items-center gap-1"><Briefcase className="size-3" />{detail.role}</span>}
                          {detail.company && <span className="inline-flex items-center gap-1"><Building2 className="size-3" />{detail.company}</span>}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditContactDialog contact={detail} onSaved={() => { selectContact(detail.id); loadContacts(); loadAlerts(); }} />
                      <Button variant="ghost" size="icon" onClick={onDeleteContact} title="Delete contact">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {detail.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {detail.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs"><Tag className="size-3" />{t}</Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {detail.email && (<div className="flex items-center gap-2"><Mail className="size-3.5 text-muted-foreground" /><a href={`mailto:${detail.email}`} className="hover:underline truncate">{detail.email}</a></div>)}
                    {detail.phone && (<div className="flex items-center gap-2"><Phone className="size-3.5 text-muted-foreground" /><span>{detail.phone}</span></div>)}
                    {detail.birthday && (<div className="flex items-center gap-2"><Cake className="size-3.5 text-muted-foreground" /><span>Birthday {fmtDate(detail.birthday)}</span></div>)}
                    <div className="flex items-center gap-2"><Clock className="size-3.5 text-muted-foreground" /><span>Last interaction: {ago(detail.lastInteractionAt)}</span></div>
                  </div>
                  {detail.notes && (
                    <>
                      <Separator />
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.notes}</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <TabsList>
                    <TabsTrigger value="info">Info</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline ({interactions.length})</TabsTrigger>
                    <TabsTrigger value="followups">Follow-ups ({drafts.length})</TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <AddInteractionDialog contactId={detail.id} onSaved={() => { refreshInteractions(); selectContact(detail.id); loadContacts(); loadAlerts(); }} />
                    <Button onClick={onGenerateFollowUp} disabled={busy.followup} size="sm">
                      <Sparkles className="size-4" />
                      {busy.followup ? "Generating..." : "Generate follow-up"}
                    </Button>
                  </div>
                </div>

                <TabsContent value="info" className="flex-1 min-h-0 mt-2">
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="text-sm">Profile summary</CardTitle>
                      <CardDescription>Quick reference for {detail.name}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Contact info</p>
                        <ul className="space-y-1">
                          <li>Email: {detail.email || <span className="text-muted-foreground">—</span>}</li>
                          <li>Phone: {detail.phone || <span className="text-muted-foreground">—</span>}</li>
                          <li>Company: {detail.company || <span className="text-muted-foreground">—</span>}</li>
                          <li>Role: {detail.role || <span className="text-muted-foreground">—</span>}</li>
                          <li>Birthday: {detail.birthday ? fmtDate(detail.birthday) : <span className="text-muted-foreground">—</span>}</li>
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Stats</p>
                        <ul className="space-y-1">
                          <li>Total interactions: {detail.interactionCount}</li>
                          <li>Last interaction: {detail.lastInteractionAt ? fmtDate(detail.lastInteractionAt) : "none yet"}</li>
                          <li>Added: {fmtDate(detail.createdAt)}</li>
                        </ul>
                      </div>
                      {detail.notes && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                          <p className="whitespace-pre-wrap">{detail.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="timeline" className="flex-1 min-h-0 mt-2">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Interaction timeline</CardTitle>
                      <CardDescription>Most recent first. Each card is one logged interaction.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 p-0">
                      <ScrollArea className="h-full max-h-[calc(100vh-26rem)] thin-scroll">
                        {interactions.length === 0 ? (
                          <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
                            No interactions logged yet. Click <span className="font-medium">Log interaction</span> to add one.
                          </div>
                        ) : (
                          <ol className="px-4 pb-4 space-y-3">
                            {interactions.map((i) => (
                              <li key={i.id} className="rounded-md border p-3 bg-card">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant={typeColor(i.type)} className="text-xs capitalize">{i.type}</Badge>
                                    <span className="text-xs text-muted-foreground">{fmtDateTime(i.occurredAt)}</span>
                                  </div>
                                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onDeleteInteraction(i.id)} title="Delete interaction">
                                    <Trash2 className="size-3.5 text-destructive" />
                                  </Button>
                                </div>
                                <p className="text-sm mt-1.5 whitespace-pre-wrap">{i.summary}</p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="followups" className="flex-1 min-h-0 mt-2">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <CardTitle className="text-sm">Follow-up drafts</CardTitle>
                          <CardDescription>AI-generated message variations. Pick a tone and regenerate.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select value={tone} onValueChange={setTone}>
                            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TONE_OPTIONS.map((t) => (<SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 p-0">
                      <ScrollArea className="h-full max-h-[calc(100vh-26rem)] thin-scroll">
                        {drafts.length === 0 ? (
                          <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
                            No drafts yet. Pick a tone and click <span className="font-medium">Generate follow-up</span>.
                          </div>
                        ) : (
                          <ol className="px-4 pb-4 space-y-3">
                            {drafts.map((d, idx) => (
                              <li key={d.id} className="rounded-md border p-3 bg-card">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">Variation {idx + 1}</Badge>
                                    <Badge variant="secondary" className="text-xs capitalize">{d.tonePreset}</Badge>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">{ago(d.createdAt)}</span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">{d.content}</p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </section>

        {/* RIGHT: dashboard + recap */}
        <aside className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          <DashboardAlerts alerts={alerts} loading={alertsLoading} onSelect={selectContact} />
          <RecapPanel
            selected={!!detail}
            recap={recap}
            useLlm={useLlmRecap}
            setUseLlm={setUseLlmRecap}
            busy={busy.recap}
            onGet={onGetRecap}
          />
        </aside>
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="px-4 sm:px-6 py-3 text-xs text-muted-foreground flex items-center justify-between gap-3 flex-wrap">
          <span>Personal CRM with AI Memory · local-first SQLite · {contacts.length} contact{contacts.length === 1 ? "" : "s"} · {contacts.reduce((n, c) => n + c.interactionCount, 0)} interaction{contacts.reduce((n, c) => n + c.interactionCount, 0) === 1 ? "" : "s"} logged</span>
          <span className="text-muted-foreground/70">LLM follow-ups + recap narrative use the configured provider; falls back to a deterministic mock offline.</span>
        </div>
      </footer>
    </div>
  );
}

// ---------- Sub-components ----------

function AlertsSummary({ alerts, loading, onSelect }: {
  alerts: AlertsData | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const top = alerts?.birthdays.slice(0, 3) ?? [];
  const topMile = alerts?.milestones.slice(0, 2) ?? [];
  if (loading && !alerts) {
    return <Card><CardContent className="py-4"><Skeleton className="h-16 w-full" /></CardContent></Card>;
  }
  if (!alerts || (top.length === 0 && topMile.length === 0)) {
    return null;
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="size-4" />Upcoming alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pb-4">
        {top.map((b) => (
          <button key={b.contact.id} onClick={() => onSelect(b.contact.id)} className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left">
            <span className="flex items-center gap-1.5 text-sm min-w-0">
              <Cake className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{b.contact.name}</span>
              {b.turningAge !== null && <span className="text-xs text-muted-foreground shrink-0">turns {b.turningAge}</span>}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">{relativeDays(b.daysUntil)}</Badge>
          </button>
        ))}
        {topMile.map((m) => (
          <button key={m.contact.id} onClick={() => onSelect(m.contact.id)} className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left">
            <span className="flex items-center gap-1.5 text-sm min-w-0">
              <ListChecks className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{m.contact.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{m.interactionCount} → {m.nextMilestone}</span>
            </span>
            <Badge variant="outline" className="text-xs shrink-0">{m.interactionsUntil} to go</Badge>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function DashboardAlerts({ alerts, loading, onSelect }: {
  alerts: AlertsData | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="flex flex-col min-h-0 flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Dashboard</CardTitle>
        <CardDescription>Birthday + milestone alerts across all contacts.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full max-h-[calc(100vh-22rem)] thin-scroll">
          <div className="px-4 pb-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5"><Cake className="size-3.5" />Birthdays (next 30 days)</p>
              {loading && !alerts ? (
                <Skeleton className="h-16 w-full" />
              ) : !alerts || alerts.birthdays.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">None in the next 30 days.</p>
              ) : (
                <ul className="space-y-1">
                  {alerts.birthdays.map((b) => (
                    <li key={b.contact.id}>
                      <button onClick={() => onSelect(b.contact.id)} className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left">
                        <span className="text-sm truncate">{b.contact.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{relativeDays(b.daysUntil)}{b.turningAge !== null ? ` · turns ${b.turningAge}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5"><ListChecks className="size-3.5" />Milestone interactions</p>
              {loading && !alerts ? (
                <Skeleton className="h-16 w-full" />
              ) : !alerts || alerts.milestones.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">No approaching milestones.</p>
              ) : (
                <ul className="space-y-1">
                  {alerts.milestones.map((m) => (
                    <li key={m.contact.id}>
                      <button onClick={() => onSelect(m.contact.id)} className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left">
                        <span className="text-sm truncate">{m.contact.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{m.interactionCount} → {m.nextMilestone} ({m.interactionsUntil} to go)</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function RecapPanel({ selected, recap, useLlm, setUseLlm, busy, onGet }: {
  selected: boolean;
  recap: RecapData | null;
  useLlm: boolean;
  setUseLlm: (v: boolean) => void;
  busy: boolean;
  onGet: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Last talked about</CardTitle>
            <CardDescription>AI recap for the selected contact.</CardDescription>
          </div>
          <Button onClick={onGet} disabled={!selected || busy} size="sm" variant="outline">
            <MessageSquare className="size-4" />
            {busy ? "..." : "Recap"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} className="size-3.5" />
          Use LLM narrative (hybrid retrieval over past interactions)
        </label>
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select a contact to generate a recap.</p>
        ) : !recap ? (
          <p className="text-sm text-muted-foreground">No recap yet. Click <span className="font-medium">Recap</span> to summarize what you and this contact have talked about.</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
              <p className="text-sm">{recap.summary}</p>
            </div>
            {recap.keywords.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Top keywords</p>
                <div className="flex flex-wrap gap-1">
                  {recap.keywords.map((k) => (
                    <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
              <span>{recap.interactionCount} interaction{recap.interactionCount === 1 ? "" : "s"}</span>
              {recap.dateRange.from && recap.dateRange.to && (
                <span>{recap.dateRange.from} → {recap.dateRange.to}</span>
              )}
              <span className="capitalize">{recap.source}</span>
            </div>
            {recap.narrative && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">LLM narrative</p>
                  <p className="text-sm whitespace-pre-wrap">{recap.narrative}</p>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Dialogs ----------

interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  birthday: string;
  notes: string;
  tags: string;
}

const EMPTY_CONTACT: ContactFormValues = { name: "", email: "", phone: "", company: "", role: "", birthday: "", notes: "", tags: "" };

function NewContactDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContactFormValues>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          role: form.role.trim() || null,
          birthday: form.birthday ? new Date(form.birthday).toISOString() : null,
          notes: form.notes.trim() || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "Contact created" });
      setForm(EMPTY_CONTACT);
      setOpen(false);
      onSaved();
    } catch (e) {
      toast({ title: "Create failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" />New Contact</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>Manually add a person to your CRM. Tags are comma-separated.</DialogDescription>
        </DialogHeader>
        <ContactForm form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Create contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditContactDialog({ contact, onSaved }: { contact: ContactListItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContactFormValues>({
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    role: contact.role ?? "",
    birthday: contact.birthday ? contact.birthday.slice(0, 10) : "",
    notes: contact.notes ?? "",
    tags: contact.tags.join(", "),
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          role: form.role.trim() || null,
          birthday: form.birthday ? new Date(form.birthday).toISOString() : null,
          notes: form.notes.trim() || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "Contact updated" });
      setOpen(false);
      onSaved();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Edit contact"><Pencil className="size-4" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>Update the profile. Tags are comma-separated.</DialogDescription>
        </DialogHeader>
        <ContactForm form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({ form, setForm }: { form: ContactFormValues; setForm: (f: ContactFormValues) => void }) {
  return (
    <div className="grid gap-3 py-2">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sam Rivera" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sam@acme.io" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="company">Company</Label>
          <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="role">Role</Label>
          <Input id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="VP Engineering" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="birthday">Birthday</Label>
        <Input id="birthday" type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tags">Tags (comma-separated)</Label>
        <Input id="tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="investor, advisor" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Met at SaaStr. Loves cycling." />
      </div>
    </div>
  );
}

function AddInteractionDialog({ contactId, onSaved }: { contactId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InteractionType>("meeting");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => {
    // default to now, in local datetime format
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!summary.trim()) {
      toast({ title: "Summary is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          summary: summary.trim(),
          occurredAt: new Date(occurredAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "Interaction logged" });
      setSummary("");
      setType("meeting");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast({ title: "Log failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="size-4" />Log interaction</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log an interaction</DialogTitle>
          <DialogDescription>One interaction = one card in the memory timeline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="itype">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as InteractionType)}>
                <SelectTrigger id="itype" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map((t) => (<SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="occ">When</Label>
              <Input id="occ" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="summ">Summary</Label>
            <Textarea id="summ" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Discussed the Q3 hiring plan and the roadmap dependency risk." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Log interaction"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
