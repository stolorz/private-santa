"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Gift,
  ListTodo,
  MailOpen,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/switch-row";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusIconButton } from "@/components/ui/status-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  anyDelivered,
  deliveryTooltip,
  type DeliveryFlags,
  type RevealLink,
} from "@/lib/delivery-status";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { eventApiPath } from "@/lib/public-path";

export function GuestRevealLinks({
  code,
  links,
  onRefresh,
}: {
  code: string;
  links: RevealLink[];
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [removedTokens, setRemovedTokens] = useState<string[]>([]);
  const [deliveredByToken, setDeliveredByToken] = useState<
    Partial<Record<string, DeliveryFlags>>
  >({});
  const [editing, setEditing] = useState<RevealLink | null>(null);
  const [removing, setRemoving] = useState<RevealLink | null>(null);

  const rows = useMemo(
    () =>
      links
        .filter((link) => !removedTokens.includes(link.token))
        .map((link) => {
          const delivered = deliveredByToken[link.token];
          return delivered ? { ...link, delivered } : link;
        }),
    [links, removedTokens, deliveredByToken],
  );

  const removePair = useMutation(
    useCallback(
      async (token: string) => {
        return requestJson(eventApiPath(code, `/assignments/${token}`), {
          method: "DELETE",
        });
      },
      [code],
    ),
  );

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => {
        setCopied((current) => (current === url ? null : current));
      }, 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Guest links</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={refreshing}
          onClick={() => startRefresh(() => onRefresh())}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each guest opens this private URL to see their match and wishlists.
        Copy and send however you like.
      </p>
      <TooltipProvider delayDuration={200}>
        <ul className="divide-y">
          {rows.map((link) => {
            const justCopied = copied === link.url;
            return (
              <li key={link.url} className="flex items-center gap-2 py-1">
                <p className="min-w-0 flex-1 truncate font-medium">
                  {link.giver}
                </p>
                <div className="flex shrink-0 items-center">
                  <DeliveryStatusIcon
                    delivered={link.delivered}
                    emailFailed={link.emailFailed}
                    emailFailedReason={link.emailFailedReason}
                    onClick={() => setEditing(link)}
                  />
                  <StatusIconButton
                    icon={MailOpen}
                    tone={link.opened ? "yes" : "no"}
                    label={
                      link.opened
                        ? "Opened their link"
                        : "Has not opened their link"
                    }
                  />
                  <StatusIconButton
                    icon={Gift}
                    tone={link.revealed ? "yes" : "no"}
                    label={
                      link.revealed
                        ? "Has seen who they are buying for"
                        : "Has not seen their match"
                    }
                  />
                  <StatusIconButton
                    icon={ListTodo}
                    tone={link.hasWishlist ? "yes" : "no"}
                    label={
                      link.hasWishlist ? "Has a wishlist" : "Has no wishlist"
                    }
                  />
                  <StatusIconButton
                    icon={BookOpen}
                    tone={link.matchWishlist}
                    strikethrough={link.matchWishlist === "none"}
                    label={
                      link.matchWishlist === "none"
                        ? "No wishlist to check"
                        : link.matchWishlist === "yes"
                          ? "Has seen the latest wishlist"
                          : "Has not seen the latest wishlist"
                    }
                  />
                </div>
                {link.blockedReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          aria-label={link.blockedReason}
                          disabled
                        >
                          <Copy />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{link.blockedReason}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label={justCopied ? "Copied" : "Copy link"}
                        onClick={() => copy(link.url)}
                      >
                        {justCopied ? <Check /> : <Copy />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {justCopied ? "Copied" : link.url}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label={`Remove ${link.giver}'s pair`}
                      onClick={() => setRemoving(link)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove pair</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </TooltipProvider>
      <DeliveryDialog
        code={code}
        link={editing}
        onClose={() => setEditing(null)}
        onSaved={(token, delivered) => {
          setDeliveredByToken((current) => ({ ...current, [token]: delivered }));
          onRefresh();
        }}
      />
      <ConfirmDialog
        open={removing != null}
        title="Remove this pair?"
        description={`This unassigns ${removing?.giver} and invalidates their private link. Anyone who already opened it will no longer see their match.`}
        confirmLabel="Remove pair"
        confirmVariant="destructive"
        busy={removePair.busy}
        onCancel={() => {
          if (removePair.busy) return;
          setRemoving(null);
        }}
        onConfirm={() => {
          if (!removing) return;
          void removePair.run(removing.token).then((result) => {
            if (!result.ok) return;
            setRemoving(null);
            setRemovedTokens((current) =>
              current.includes(removing.token)
                ? current
                : [...current, removing.token],
            );
            onRefresh();
          });
        }}
      >
        {removePair.error ? (
          <p className="text-sm text-destructive">{removePair.error}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function DeliveryStatusIcon({
  delivered,
  emailFailed,
  emailFailedReason,
  onClick,
}: {
  delivered: DeliveryFlags;
  emailFailed: boolean;
  emailFailedReason: string | null;
  onClick: () => void;
}) {
  const tone = emailFailed
    ? "error"
    : anyDelivered(delivered)
      ? "yes"
      : "no";
  return (
    <StatusIconButton
      icon={Send}
      tone={tone}
      label={deliveryTooltip(delivered, { emailFailed, emailFailedReason })}
      onClick={onClick}
      badge={emailFailed}
    />
  );
}

function DeliveryDialog({
  code,
  link,
  onClose,
  onSaved,
}: {
  code: string;
  link: RevealLink | null;
  onClose: () => void;
  onSaved: (token: string, delivered: DeliveryFlags) => void;
}) {
  return (
    <Dialog
      open={link != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {link ? (
          <DeliveryDialogBody
            key={link.token}
            code={code}
            link={link}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialogBody({
  code,
  link,
  onClose,
  onSaved,
}: {
  code: string;
  link: RevealLink;
  onClose: () => void;
  onSaved: (token: string, delivered: DeliveryFlags) => void;
}) {
  const [draft, setDraft] = useState<DeliveryFlags>(link.delivered);
  const save = useMutation(
    useCallback(
      async (next: DeliveryFlags) => {
        const result = await requestJson<{ delivered?: DeliveryFlags }>(
          eventApiPath(code, `/assignments/${link.token}`),
          { method: "PATCH", ...jsonBody(next) },
        );
        if (result.ok && !result.data?.delivered) {
          return {
            ok: false as const,
            data: null,
            error: "Could not save delivery status.",
            status: result.status,
          };
        }
        return result;
      },
      [code, link.token],
    ),
    { fallbackError: "Could not save delivery status." },
  );

  async function onSave() {
    const result = await save.run(draft);
    if (!result.ok || !result.data?.delivered) return;
    onSaved(link.token, result.data.delivered);
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delivery for {link.giver}</DialogTitle>
        <DialogDescription>
          Mark which methods successfully reached this guest.
        </DialogDescription>
        {link.emailFailed && (
          <p className="text-sm text-destructive">
            {link.emailFailedReason
              ? `Email delivery failed: ${link.emailFailedReason}`
              : "Email delivery failed."}
          </p>
        )}
      </DialogHeader>
      <div className="space-y-2">
        <SwitchRow
          title="WhatsApp"
          checked={draft.whatsapp}
          onCheckedChange={(whatsapp) => setDraft((d) => ({ ...d, whatsapp }))}
        />
        <SwitchRow
          title="Signal"
          checked={draft.signal}
          onCheckedChange={(signal) => setDraft((d) => ({ ...d, signal }))}
        />
        <SwitchRow
          title="Email"
          checked={draft.email}
          onCheckedChange={(email) => setDraft((d) => ({ ...d, email }))}
        />
        <SwitchRow
          title="Manual"
          description="Tick this after you copy and send the private link yourself."
          checked={draft.manual}
          onCheckedChange={(manual) => setDraft((d) => ({ ...d, manual }))}
        />
      </div>
      {save.error && <p className="text-sm text-destructive">{save.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={save.busy} onClick={() => void onSave()}>
          {save.busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}
