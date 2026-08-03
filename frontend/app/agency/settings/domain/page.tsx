"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Globe, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

type Step = 1 | 2 | 3 | 4;

// Basic hostname shape: labels of alphanumerics/hyphens separated by dots,
// requiring at least one dot (so bare words like "localhost" are rejected).
const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const domainSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .max(253, "Domain is too long")
    .regex(DOMAIN_REGEX, "Enter a valid domain, e.g. portal.youragency.com"),
});

type DomainFormData = z.infer<typeof domainSchema>;

export default function AgencyDomainPage() {
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [dnsResolves, setDnsResolves] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    watch,
    setValue,
    setError,
    handleSubmit,
    formState: { errors },
  } = useForm<DomainFormData>({
    resolver: zodResolver(domainSchema),
    defaultValues: { domain: "" },
  });

  const domain = watch("domain");

  useEffect(() => {
    apiClient
      .get("/api/v1/agency/me/domain-status")
      .then(({ data }) => {
        const d = data.data;
        setCurrentDomain(d.domain);
        setVerified(d.verified);
        setDnsResolves(d.dns_resolves ?? null);
        if (d.domain) {
          setValue("domain", d.domain);
          setStep(d.verified ? 4 : 3);
        }
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Failed to load domain settings",
          description: getErrorMessage(err),
        });
      })
      .finally(() => setLoading(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [setValue]);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await apiClient.get("/api/v1/agency/me/domain-status");
        if (data.data?.verified) {
          setVerified(true);
          setStep(4);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Transient polling failure — silently retry on the next interval.
      }
    }, 30_000);
  }

  function goToStep2() {
    setStep(2);
  }

  async function verify() {
    setChecking(true);
    try {
      const { data } = await apiClient.post("/api/v1/agency/verify-domain", {
        domain: domain.trim(),
      });
      setDnsResolves(data.data.dns_resolves);
      if (data.data.verified) {
        setVerified(true);
        setCurrentDomain(domain);
        setStep(4);
      } else {
        setStep(3);
        startPolling();
      }
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof DomainFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Domain verification failed",
        description: getErrorMessage(err),
      });
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6" />Custom Domain</h1>
        <p className="text-sm text-muted-foreground mt-1">Host your agency portal on your own domain.</p>
      </div>

      <Card className="p-4 space-y-4">
        {/* Step 1 */}
        <form onSubmit={handleSubmit(goToStep2)} className={step >= 1 ? "" : "opacity-40"}>
          <p className="text-sm font-semibold mb-2">Step 1 — Enter your domain</p>
          <div className="flex gap-2">
            <Input
              value={domain}
              onChange={e => setValue("domain", e.target.value.toLowerCase(), { shouldValidate: true })}
              placeholder="portal.youragency.com"
              disabled={step >= 2 && verified}
            />
            {step === 1 && (
              <Button type="submit" disabled={!domain.trim()}>Next</Button>
            )}
            {step > 1 && !verified && (
              <Button type="button" variant="outline" onClick={() => setStep(1)}>Change</Button>
            )}
          </div>
          {errors.domain && (
            <p className="text-sm text-destructive mt-1">{errors.domain.message}</p>
          )}
        </form>

        {/* Step 2 */}
        {step >= 2 && (
          <div className={step >= 2 ? "" : "opacity-40"}>
            <p className="text-sm font-semibold mb-2">Step 2 — Configure DNS</p>
            <p className="text-sm text-muted-foreground mb-2">Add this CNAME record in your DNS provider:</p>
            <div className="rounded bg-muted px-3 py-2 font-mono text-xs space-y-1">
              <p><span className="text-muted-foreground">Type:</span> CNAME</p>
              <p><span className="text-muted-foreground">Name:</span> {domain.split(".")[0]}</p>
              <p><span className="text-muted-foreground">Value:</span> proxy.chatcraft.ai</p>
              <p><span className="text-muted-foreground">TTL:</span> 300</p>
            </div>
            {step === 2 && (
              <Button className="mt-3" onClick={() => setStep(3)}>I've added the DNS record</Button>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step >= 3 && !verified && (
          <div>
            <p className="text-sm font-semibold mb-2">Step 3 — Verify DNS propagation</p>
            {dnsResolves === false && (
              <div className="flex items-center gap-2 text-amber-600 text-sm mb-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                DNS not yet propagated. Auto-checking every 30 seconds.
              </div>
            )}
            <Button onClick={verify} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {checking ? "Checking…" : "Verify Now"}
            </Button>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && verified && (
          <div className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Domain verified!</p>
              <p className="text-xs text-muted-foreground">{currentDomain} is now your agency portal domain.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
