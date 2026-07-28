# DNS migration: horizonafrica.com → Cloudflare

Purpose: move `horizonafrica.com` DNS from AWS Route 53 to Cloudflare so a
Cloudflare Tunnel can serve `karen-preview.horizonafrica.com` for the Karen
Country Club client preview, without exposing inbound ports on the VM.

**This domain carries production Google Workspace email.** The whole runbook is
built around not breaking it. Work top to bottom; do not skip §2 or §4.

---

## 1. Records live on Route 53 (captured 2026-07-28)

Best-effort `dig` sweep against `ns-127.awsdns-15.com`. **This is not a complete
list** — DNS cannot enumerate a zone. §2 gets the authoritative one.

| Type | Name | Value |
|------|------|-------|
| A | `@` | `3.175.179.22`, `3.175.179.31`, `3.175.179.32`, `3.175.179.107` |
| CNAME/A | `www` | → apex (same four A records) |
| MX | `@` | `1 aspmx.l.google.com`, `5 alt1`, `5 alt2`, `10 alt3`, `10 alt4` (`.aspmx.l.google.com`) |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` |
| TXT | `@` | `MS=ms4552728` |
| TXT | `@` | `google-site-verification=pt7OWm3CO-t7GvRSGwFaOxTBMc5g0iRMMv8YKkrYPI0` |
| TXT | `@` | `sso1=d7978c` |
| TXT | `google._domainkey` | DKIM RSA key — **split across two quoted strings** |
| NS | `@` | four `awsdns` servers |
| CAA | `@` | none |
| AAAA | `@` | none |

No `_dmarc` record exists. Do not add one during the migration — change one
thing at a time.

### The DKIM record is the highest-risk item

`google._domainkey` is a single TXT record whose value is split into two quoted
strings because TXT strings cap at 255 characters. It must arrive at Cloudflare
as **one record with both strings**, not two records and not one truncated
string. If it breaks, outbound mail starts failing DKIM and lands in spam —
often silently, and often not for hours. Verify it explicitly in §4.

---

## 2. Export the authoritative zone from Route 53

Do this first. It is the only complete record list and the basis for rollback.

Console: Route 53 → Hosted zones → `horizonafrica.com` → **Export zone file**.

Or via CLI:

```bash
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name horizonafrica.com --query 'HostedZones[0].Id' --output text)
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  > route53-horizonafrica-backup-$(date +%Y%m%d).json
```

Keep the file. Compare it against Cloudflare in §4 record by record.

---

## 3. Add the zone to Cloudflare (nameservers NOT changed yet)

1. Create a free Cloudflare account, **Add a site** → `horizonafrica.com`, Free plan.
2. Cloudflare auto-scans and imports what it can find. It will miss records it
   cannot guess, which is why §2 exists.
3. Add anything from the Route 53 export that the scan missed.
4. **Set every imported record to DNS-only (grey cloud).**

   Proxying (orange cloud) routes traffic through Cloudflare's edge and changes
   TLS termination, origin IP visibility, and header behaviour. For this
   migration Cloudflare should be a pure DNS host — behaviour identical to
   Route 53. Only the tunnel hostname in §6 is proxied, and Cloudflare creates
   that record itself.

   MX and TXT records cannot be proxied at all; this applies to A/AAAA/CNAME.

5. Lower TTLs to 5 minutes (Auto) so a rollback propagates fast.

Nothing has changed for the internet yet — Route 53 is still authoritative.

---

## 4. Verify BEFORE cutover (the gate)

Query Cloudflare's assigned nameservers directly. Substitute the two Cloudflare
NS shown in the dashboard for `CF_NS`.

```bash
CF_NS=<name>.ns.cloudflare.com

# Mail — all five MX must be present with matching priorities
dig +short @$CF_NS horizonafrica.com MX | sort

# SPF and the verification TXT records
dig +short @$CF_NS horizonafrica.com TXT

# DKIM — compare byte for byte against Route 53
dig +short @$CF_NS google._domainkey.horizonafrica.com TXT > /tmp/cf-dkim.txt
dig +short @ns-127.awsdns-15.com google._domainkey.horizonafrica.com TXT > /tmp/r53-dkim.txt
diff /tmp/cf-dkim.txt /tmp/r53-dkim.txt && echo "DKIM MATCHES"

# Website
dig +short @$CF_NS horizonafrica.com A | sort
dig +short @$CF_NS www.horizonafrica.com | sort
```

**Do not proceed to §5 until `DKIM MATCHES` prints and the MX list is identical.**

A quick side-by-side of everything:

```bash
for t in A MX TXT NS; do
  echo "--- $t ---"
  diff <(dig +short @ns-127.awsdns-15.com horizonafrica.com $t | sort) \
       <(dig +short @$CF_NS horizonafrica.com $t | sort) \
    && echo "  identical"
done
```

`NS` is expected to differ. Everything else should be identical.

---

## 5. Cut over

Change nameservers **at the registrar** (wherever `horizonafrica.com` is
registered — this is registrar config, not Route 53) to the two Cloudflare
nameservers.

- Propagation: typically 1–4 hours, up to 48.
- **Do not delete the Route 53 hosted zone.** Keep it at least a week. Rollback
  is pointing the registrar's nameservers back — instant and complete, but only
  while the zone still exists.
- AWS bills ~$0.50/month for a hosted zone. Cheap insurance.

### Post-cutover mail check

Within the first hour:

1. Send a mail from a `@horizonafrica.com` account to a Gmail address.
2. In Gmail: **Show original**. Confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
3. Reply from the Gmail address and confirm it arrives.

If DKIM fails, roll back nameservers immediately, then debug. Do not "wait and
see" on mail authentication.

---

## 6. Cloudflare Tunnel for the preview

Only after §5 is verified. Runs **on the Oracle VM**, not locally.

```bash
# On the VM
curl -L -o cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb

cloudflared tunnel login          # opens a URL; authorise the horizonafrica.com zone
cloudflared tunnel create karen-preview
cloudflared tunnel route dns karen-preview karen-preview.horizonafrica.com
```

`tunnel create` writes credentials to `~/.cloudflared/<TUNNEL_ID>.json`.
**That file is a secret** — it authenticates the tunnel. Never commit it.

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: karen-preview.horizonafrica.com
    service: http://localhost:8080
  - service: http_status:404
```

Run it as a service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Compose changes

With the tunnel terminating TLS at Cloudflare's edge, Caddy no longer needs a
domain, port 443, or Let's Encrypt. Bind it to `127.0.0.1:8080` and drop the
`DOMAIN` variable and the `80:80` / `443:443` port mappings from
`docker-compose.yml`.

`FRONTEND_URL` in `backend/.env` must still be
`https://karen-preview.horizonafrica.com` — CORS is checked against the public
origin, not the internal bind.

### Firewall

The tunnel dials **outbound**, so no inbound ports are needed. Leave the Oracle
VCN security list closed except SSH (22), and leave the instance iptables alone.
This is the security payoff for the migration: the VM has no public attack
surface.

---

## 7. Rollback

| Problem | Action |
|---------|--------|
| Mail failing after cutover | Point registrar nameservers back to the four `awsdns` servers. Recovers in minutes to hours. |
| Website wrong | Same rollback, or fix the A records in Cloudflare (faster if the fault is one record). |
| Tunnel down | Independent of DNS. `sudo systemctl restart cloudflared`, check `journalctl -u cloudflared`. |

Rollback works **only while the Route 53 hosted zone still exists**. Do not
delete it until mail has been verified healthy for a full week.
