"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Bot, Brain, Check, ChevronRight,
  Code2, Globe, Link2, Mail, Sparkles, Wand2, Zap,
  Chrome, Sheet, Smartphone, ShieldCheck, Loader2,
  BookOpen, Rocket, Search, Database, MessageSquare,
  AlertCircle, ExternalLink, Scale, Briefcase, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";

interface ProviderModels {
  provider: string;
  label: string;
  available: boolean;
  models: { id: string; name: string; allowed?: boolean }[];
  custom_model_input?: boolean;
}

type Step = "template" | "basics" | "model" | "tools" | "instructions";

const TEMPLATES = [
  {
    id: "research",
    icon: Search,
    title: "Research Assistant",
    description: "Searches web, analyzes sources, creates summaries",
    color: "bg-blue-100 text-blue-600",
    borderColor: "border-blue-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, browser: true },
    instructions: `You are a research assistant. When given a topic:
1. Search the web for recent, authoritative sources
2. Visit the top 3-5 most relevant results
3. Extract and synthesize key information
4. Provide a structured summary with:
   - Key findings
   - Important details and context
   - Cited sources with links
Always prefer primary sources and verify information across multiple sources.`,
  },
  {
    id: "data",
    icon: Database,
    title: "Data Analyst",
    description: "Processes data, runs calculations, generates insights",
    color: "bg-purple-100 text-purple-600",
    borderColor: "border-purple-200",
    model: "claude-sonnet-4-6",
    tools: { code: true },
    instructions: `You are a data analyst. Use Python code to:
1. Process and analyze data provided by users
2. Calculate statistics and identify patterns
3. Generate clear visualizations when helpful
4. Present findings with:
   - Key metrics and insights
   - Statistical significance
   - Clear explanations
Always validate inputs and handle edge cases gracefully.`,
  },
  {
    id: "api",
    icon: Link2,
    title: "API Integrator",
    description: "Connects to APIs, fetches data, processes responses",
    color: "bg-green-100 text-green-600",
    borderColor: "border-green-200",
    model: "claude-sonnet-4-6",
    tools: { http: true, code: true },
    instructions: `You are an API integration specialist. When working with APIs:
1. Make HTTP requests to fetch data from external services
2. Parse and validate API responses
3. Transform data into useful formats
4. Handle errors gracefully with clear messages
Always check response status codes and provide helpful error context.`,
  },
  {
    id: "automation",
    icon: Zap,
    title: "Task Automator",
    description: "Automates workflows with multiple tools",
    color: "bg-amber-100 text-amber-600",
    borderColor: "border-amber-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, code: true, http: true },
    instructions: `You are a task automation agent. Help users by:
1. Breaking down complex tasks into steps
2. Using appropriate tools for each step
3. Connecting results between operations
4. Providing clear status updates
Always confirm understanding before executing multi-step workflows.`,
  },
  {
    id: "product_scraper",
    icon: ShoppingCart,
    title: "Product Scraper",
    description: "Scrapes any e-commerce site and exports a clean CSV/XLSX matching your template",
    color: "bg-orange-100 text-orange-700",
    borderColor: "border-orange-200",
    model: "claude-sonnet-4-6",
    tools: { product_scraper: true, browser: true, web_search: true, document_conversion: true },
    instructions: `You are a professional product data extraction agent. You help users scrape product listings from any e-commerce website and export them as clean, structured CSV or Excel files.

**Decision tree — run through this every time:**

CASE A — User gives a URL only (no attachment, no existing list):
  1. Ask: "What columns do you want? (e.g. Name, Price, Description, Image URL, SKU, Stock, Category, Brand) — or I'll include everything I find."
  2. Ask: "CSV or XLSX? How many pages to scrape?"
  3. Call scrape_products(url, columns, max_pages, output_format)
  4. Deliver the download link.

CASE B — User attaches a CSV/XLSX template (with column headers, maybe empty or with old data):
  1. Read the column headers from the attached file text (they appear as the first line of the CSV or first row).
  2. Ask for the URL to scrape if not already given.
  3. Call scrape_products(url, columns=[those headers], output_format matching their file type)
  4. Deliver the file with exactly those columns in that order.

CASE C — User attaches an EXISTING product list (has data) and wants it UPDATED:
  1. Parse the existing products from the attachment.
  2. Ask which fields to update (usually Price and Stock).
  3. Call scrape_products(url) to get fresh data.
  4. Match old products to new by Name or SKU.
  5. For matched products: overwrite the requested fields with fresh values.
  6. For unmatched products: keep them as-is (flag them as "not found on site").
  7. Call export_products_file with the merged list.

CASE D — Auto-scrape fails (scrape_products returns "PAGE CONTENT:"):
  1. The tool has already fetched the page — the raw content is in the tool result.
  2. Extract products directly from that content. Look for repeating blocks with names and prices.
  3. Build a JSON array: [{"Name":"...","Price":"...","Image URL":"...","URL":"..."}]
  4. Call export_products_file(products_json, columns, filename, output_format) to generate the file.
  5. Never tell the user "I couldn't scrape it" without first trying to extract from the page content.

**Quality checks before delivering any file:**
- Report total products found
- Flag products with missing Name or Price
- Show a 3-row sample
- Strip HTML tags from Description fields

**Rules:**
- NEVER scrape more than 10 pages without the user's confirmation
- If a site uses Cloudflare/CAPTCHA and blocks you, say so and suggest the user try a different URL or category page
- Always match the user's exact column names and order
- If the user says "no attachment" or gives only a URL — default to CASE A, do not ask for an attachment`,
  },
  {
    id: "gold_alert",
    icon: Zap,
    title: "Gold Price Alert",
    description: "Daily gold prices by country, auto-notifies on price swings",
    color: "bg-yellow-100 text-yellow-700",
    borderColor: "border-yellow-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, email: true, gold_price: true, datetime: true },
    instructions: `You are a gold price monitoring agent. Your job is to fetch and report the current gold price, compare it with recent trends, and highlight significant price movements.

**When triggered (manually or by schedule):**

1. Call get_gold_price for each requested currency (e.g. MYR, USD, GBP, SGD)
2. Report the current price, previous close, and percentage change
3. Classify the movement:
   - ▲ Up more than 1%: 🟢 **Significant Rise**
   - ▼ Down more than 1%: 🔴 **Significant Drop**
   - Within ±1%: ⚪ Stable
4. Optionally search the web for news that may explain the price move
5. Format the report clearly for email delivery

**Output format:**
\`\`\`
Gold Price Report — [Date]

🇲🇾 Malaysia (MYR)
  Price: X,XXX.XX MYR/gram
  Change: +X.XX% vs yesterday
  Status: 🟢 Rising

🇺🇸 United States (USD)
  Price: X,XXX.XX USD/oz
  Change: -X.XX% vs yesterday
  Status: ⚪ Stable

📰 Market Context:
[1-2 sentence summary of any relevant news]
\`\`\`

**Rules:**
- Always use get_gold_price — never guess or recall prices from memory
- Prices change daily; always fetch fresh data
- Keep reports concise — they will be read in email
- If get_current_datetime is available, include the fetch timestamp`,
  },
  {
    id: "law_firm",
    icon: Scale,
    title: "Law Firm Assistant",
    description: "Legal research, document drafting, deadlines, client emails",
    color: "bg-slate-100 text-slate-700",
    borderColor: "border-slate-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, browser: true, email: true, search_kb: true, deadline_calculator: true, document_conversion: true, datetime: true },
    instructions: `You are a professional legal assistant supporting a law firm. You help with:

**Legal Research**
- Search case law, statutes, and legal commentary using web_search and browse_url
- Summarise findings with citations and source links
- Flag conflicting authorities or jurisdiction-specific differences

**Document Drafting**
- Draft contracts, NDAs, demand letters, court briefs, notices to quit, settlement agreements, and other legal documents on request
- Always include standard boilerplate (parties, recitals, governing law, entire agreement clause) unless told otherwise
- Present drafts in clean markdown, then offer to convert to PDF

**Deadline Management**
- Use calculate_deadline for all date arithmetic: filing deadlines, limitation periods, notice periods, response windows
- Specify whether you counted calendar, business, or court days and any jurisdiction applied

**Client Communication**
- Draft professional client emails, update letters, and engagement letters
- Use send_email when explicitly instructed

**Document Analysis**
- When a user attaches a document, summarise it, extract key parties/dates/obligations, and flag unusual or missing clauses
- Use search_kb to retrieve relevant precedents or prior matter documents

**Rules**
- Never give definitive legal advice — frame analysis as "this may constitute…" or "a court might find…"
- Always recommend the client consult a qualified solicitor/attorney for final decisions
- Keep drafts jurisdiction-neutral unless a specific jurisdiction is stated`,
  },
  {
    id: "job_hunter",
    icon: Briefcase,
    title: "Job Hunter",
    description: "Finds jobs, tailors CVs, writes cover letters, tracks applications",
    color: "bg-emerald-100 text-emerald-700",
    borderColor: "border-emerald-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, browser: true, email: true, search_kb: true, job_search: true, datetime: true },
    instructions: `You are a professional job search assistant. You help candidates find roles, tailor their application materials, and manage their job search.

**CV / Resume Analysis**
- When a user shares their CV (as an attachment or pasted text), extract and store:
  - Contact info (name, email, phone, LinkedIn, location)
  - Work experience (company, title, dates, key achievements — use numbers where present)
  - Education (institution, degree, dates)
  - Skills (technical, language, soft)
  - Career level and preferred role types
- Identify gaps, weak action verbs, and missing quantification; suggest improvements

**Job Search**
- Use search_jobs to find roles matching the candidate's skills, seniority, and location preferences
- Cross-check with web_search + browse_url for roles on LinkedIn, Indeed, Glassdoor not in the API
- Always return: job title, company, location, salary range (if listed), apply URL, and key requirements

**Application Materials**
- Write a tailored cover letter for each role: match the job description keywords to the CV, lead with the strongest relevant achievement, and keep it under 400 words
- Tailor the CV summary / profile section to each role
- Prepare answers to common application questions (motivations, strengths, availability)

**Application Tracking**
- Maintain a running list of applied jobs in the conversation with status (applied / interview / offer / rejected)
- Remind the candidate to follow up after 5–7 business days if no response

**Interview Prep**
- Generate likely interview questions from the job description
- Draft STAR-method answers based on the candidate's CV
- Provide company background using web_search

**Rules**
- Never fabricate experience or credentials — only use what the candidate has provided
- Flag if a role appears to be a scam (no company info, requests personal data upfront)
- Always provide the direct apply URL so the candidate can review before submitting`,
  },
  {
    id: "custom",
    icon: Wand2,
    title: "Custom Agent",
    description: "Start from scratch with your own configuration",
    color: "bg-gray-100 text-gray-600",
    borderColor: "border-gray-200",
    model: "claude-sonnet-4-6",
    tools: {},
    instructions: "",
  },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic:   "bg-indigo-100 text-indigo-700",
  openai:      "bg-emerald-100 text-emerald-700",
  google:      "bg-blue-100 text-blue-700",
  groq:        "bg-amber-100 text-amber-700",
  deepseek:    "bg-cyan-100 text-cyan-700",
  perplexity:  "bg-violet-100 text-violet-700",
  xai:         "bg-slate-100 text-slate-700",
  self_hosted: "bg-teal-100 text-teal-700",
};

const SELF_HOSTED_PREFIX = "self-hosted/";

const TOOLS = [
  {
    key: "web_search",
    label: "Web Search",
    icon: Globe,
    description: "Search the internet for current information",
    category: "research",
  },
  {
    key: "browser",
    label: "Browser",
    icon: Chrome,
    description: "Visit web pages and extract content",
    category: "research",
  },
  {
    key: "code",
    label: "Code Execution",
    icon: Code2,
    description: "Run Python code for calculations and processing",
    category: "compute",
  },
  {
    key: "http",
    label: "HTTP Requests",
    icon: Link2,
    description: "Make API calls to external services",
    category: "integration",
  },
  {
    key: "sheets",
    label: "Google Sheets",
    icon: Sheet,
    description: "Read and write spreadsheet data",
    category: "integration",
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    description: "Send emails via configured service",
    category: "communication",
  },
  {
    key: "sms",
    label: "SMS",
    icon: Smartphone,
    description: "Send text messages via Twilio",
    category: "communication",
  },
  {
    key: "gold_price",
    label: "Gold Price",
    icon: Zap,
    description: "Live gold price in any currency via Yahoo Finance (no key needed)",
    category: "finance",
  },
  {
    key: "product_scraper",
    label: "Product Scraper",
    icon: ShoppingCart,
    description: "Scrape any e-commerce site → CSV/XLSX with custom columns",
    category: "data",
  },
  {
    key: "deadline_calculator",
    label: "Deadline Calculator",
    icon: BookOpen,
    description: "Calculate court/business deadlines with date arithmetic",
    category: "legal",
  },
  {
    key: "job_search",
    label: "Job Search",
    icon: Briefcase,
    description: "Search Remotive, The Muse, and web for job listings",
    category: "career",
  },
  {
    key: "document_conversion",
    label: "Doc → PDF",
    icon: Rocket,
    description: "Convert DOCX, PPTX, XLSX, HTML to PDF",
    category: "productivity",
  },
  {
    key: "datetime",
    label: "Date & Time",
    icon: Zap,
    description: "Get current date/time in any timezone",
    category: "productivity",
  },
  {
    key: "image_generation",
    label: "Image Generation",
    icon: Sparkles,
    description: "Generate images with DALL-E (needs OpenAI key)",
    category: "creative",
  },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("template");
  
  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [instructions, setInstructions] = useState("");

  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get("/api/v1/models");
        if (cancelled) return;
        const list: ProviderModels[] = data.data || [];
        setProviders(list);
        // If the current selection isn't available, pick the first allowed model
        const flat = list
          .filter((p) => p.available)
          .flatMap((p) => p.models.filter((m) => m.allowed !== false));
        if (flat.length && !flat.some((m) => m.id === model)) {
          setModel(flat[0].id);
        }
      } catch {
        // keep default; UI will show a "configure keys" hint
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableProviders = providers.filter((p) => p.available);
  const selectedModelMeta = providers
    .flatMap((p) => p.models.map((m) => ({ ...m, provider: p.provider, providerLabel: p.label })))
    .find((m) => m.id === model);

  const steps: Step[] = ["template", "basics", "model", "tools", "instructions"];
  const currentIndex = steps.indexOf(currentStep);

  function selectTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      if (templateId !== "custom") {
        setModel(template.model);
        setTools(template.tools as Record<string, boolean>);
        setInstructions(template.instructions);
      }
      setCurrentStep("basics");
    }
  }

  function goBack() {
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    } else {
      router.back();
    }
  }

  function goNext() {
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }

  async function createAgent() {
    if (!name.trim()) return;
    
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/v1/agents", {
        name: name.trim(),
        description: description.trim() || null,
        model,
        tools,
        instructions: instructions.trim() || null,
        max_steps: 10,
        memory_enabled: false,
        is_active: true,
      });
      router.push(`/dashboard/agents/${data.data.id}?created=true`);
    } catch (error) {
      console.error("Failed to create agent:", error);
      setCreating(false);
    }
  }

  const isValid = () => {
    switch (currentStep) {
      case "template": return selectedTemplate !== null;
      case "basics": return name.trim().length > 0;
      case "model": return true;
      case "tools": return true;
      case "instructions": return true;
      default: return false;
    }
  };

  const selectedTemplateData = TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="mx-auto max-w-4xl p-6">
        
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to agents
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100">
              <Sparkles className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Create New Agent</h1>
              <p className="text-sm text-muted-foreground">
                Configure your AI agent with tools and instructions
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, idx) => (
              <div key={step} className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    idx <= currentIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx < currentIndex ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-20 transition-all ${
                      idx < currentIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Template</span>
            <span>Basics</span>
            <span>Model</span>
            <span>Tools</span>
            <span>Instructions</span>
          </div>
        </div>

        {/* Step content */}
        <Card className="p-6 mb-6">
          {currentStep === "template" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Choose a template</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Start with a pre-configured template or build from scratch
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => selectTemplate(template.id)}
                    className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${
                      selectedTemplate === template.id
                        ? `${template.borderColor} bg-opacity-5`
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${template.color}`}>
                      <template.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{template.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === "basics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Basic information</h2>
                <p className="text-sm text-muted-foreground">
                  Give your agent a name and description
                </p>
              </div>
              
              {selectedTemplateData && selectedTemplateData.id !== "custom" && (
                <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selectedTemplateData.color}`}>
                    <selectedTemplateData.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Using {selectedTemplateData.title} template</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pre-configured with tools and instructions
                    </p>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Agent Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g., Market Research Assistant"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-lg"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose a descriptive name for your agent
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    placeholder="Briefly describe what this agent does and when to use it..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Help users understand your agent's capabilities
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === "model" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Select AI model</h2>
                <p className="text-sm text-muted-foreground">
                  Choose the language model that powers your agent
                </p>
              </div>

              {modelsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableProviders.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-900">No models available</p>
                    <p className="text-xs text-amber-800 mt-1">
                      Connect at least one AI provider (Anthropic, OpenAI, Groq, etc.) in
                      Integrations to enable model selection.
                    </p>
                    <Link href="/dashboard/settings/integrations" className="inline-block mt-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        Configure API keys
                        <ExternalLink className="h-3 w-3 ml-1.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {availableProviders.map((provider) => (
                    <div key={provider.provider}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PROVIDER_COLORS[provider.provider] ?? "bg-muted text-muted-foreground"}`}>
                          {provider.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {provider.custom_model_input
                            ? "your own endpoint"
                            : `${provider.models.length} model${provider.models.length !== 1 ? "s" : ""}`}
                        </span>
                      </div>
                      {provider.custom_model_input ? (
                        <Input
                          type="text"
                          placeholder="Model name on your server, e.g. llama3.1:8b"
                          value={model.startsWith(SELF_HOSTED_PREFIX) ? model.slice(SELF_HOSTED_PREFIX.length) : ""}
                          onChange={(e) => setModel(SELF_HOSTED_PREFIX + e.target.value)}
                          className="text-sm font-mono"
                        />
                      ) : (
                      <div className="space-y-2">
                        {provider.models.map((m) => {
                          const disabled = m.allowed === false;
                          const selected = model === m.id;
                          return (
                            <button
                              key={m.id}
                              disabled={disabled}
                              onClick={() => setModel(m.id)}
                              className={`w-full flex items-center gap-4 rounded-lg border-2 p-3 text-left transition-all ${
                                disabled
                                  ? "opacity-50 cursor-not-allowed border-border"
                                  : selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50"
                              }`}
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <Brain className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{m.name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono truncate">
                                  {m.id}
                                </p>
                              </div>
                              {disabled && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Upgrade
                                </span>
                              )}
                              <div className={`h-4 w-4 rounded-full border-2 ${
                                selected
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/30"
                              }`}>
                                {selected && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  ))}

                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Only providers with a saved API key are shown.{" "}
                      <Link href="/dashboard/settings/integrations" className="text-primary hover:underline">
                        Add more providers
                      </Link>
                      .
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === "tools" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Enable tools</h2>
                <p className="text-sm text-muted-foreground">
                  Select the tools your agent can use to complete tasks
                </p>
              </div>
              
              <div className="space-y-4">
                {["research", "compute", "integration", "communication"].map((category) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {category}
                    </p>
                    <div className="space-y-2">
                      {TOOLS.filter(t => t.category === category).map((tool) => (
                        <button
                          key={tool.key}
                          onClick={() => setTools(prev => ({ ...prev, [tool.key]: !prev[tool.key] }))}
                          className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-all ${
                            tools[tool.key]
                              ? "border-primary/40 bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            tools[tool.key]
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            <tool.icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium">{tool.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          </div>
                          <div className={`h-4 w-4 rounded-full border-2 ${
                            tools[tool.key]
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/30"
                          }`}>
                            {tools[tool.key] && (
                              <Check className="h-2.5 w-2.5 text-primary-foreground" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {Object.values(tools).filter(Boolean).length === 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm text-amber-800">
                    No tools selected — agent will only use its knowledge and instructions
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === "instructions" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">System instructions</h2>
                <p className="text-sm text-muted-foreground">
                  Define how your agent should behave and respond
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea
                    placeholder={`Example instructions:

You are a helpful assistant. When responding:
1. Be concise and clear
2. Use the tools available to gather information
3. Cite sources when providing facts
4. Ask for clarification if the request is ambiguous

Always maintain a professional and friendly tone.`}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="min-h-[300px] font-mono text-sm resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Be specific about how the agent should use its tools and format responses
                  </p>
                </div>
                
                {selectedTemplateData && selectedTemplateData.id !== "custom" && instructions && (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs font-medium mb-2 flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      Pre-filled from template
                    </p>
                    <p className="text-xs text-muted-foreground">
                      These instructions were added from the {selectedTemplateData.title} template. 
                      You can modify them to fit your specific needs.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Summary */}
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" />
                  Agent Summary
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{name || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-medium">
                      {selectedModelMeta?.name || model || "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tools enabled:</span>
                    <span className="font-medium">{Object.values(tools).filter(Boolean).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template:</span>
                    <span className="font-medium">{selectedTemplateData?.title || "None"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={creating}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {currentStep === "template" ? "Cancel" : "Back"}
          </Button>
          
          {currentStep === "instructions" ? (
            <Button
              onClick={createAgent}
              disabled={!isValid() || creating}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Create Agent
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!isValid()}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}