# Open Name Tags Domain Deployment

This runbook moves the product-facing site onto [opennametags.org](https://opennametags.org) while keeping the underlying ONT protocol identifiers unchanged for compatibility.

## Goal

Serve the Open Name Tags website directly from the VPS at:

- `https://opennametags.org`
- `https://www.opennametags.org`

while preserving the existing compatibility alias at:

- a legacy shared-host path, if you still use one

The dedicated domain deployment serves the app at the root path `/`.

## 1. Prepare The VPS

From the repo root:

```bash
npm run deploy:vps -- root@<server-ip> ~/.ssh/<your-key>
npm run bootstrap:ont-domain:vps -- root@<server-ip> ~/.ssh/<your-key> opennametags.org
```

The deploy script refuses to deploy a dirty working tree by default. Commit and
push first so the running VPS can be tied back to a known Git SHA. For an
intentional prototype-only deploy, set `ONT_DEPLOY_ALLOW_DIRTY=1` explicitly.

That will:

- deploy the latest app code
- create `/etc/ont/ont-domain.env`
- create `ont-domain-web.service` on port `3002`
- install and configure Caddy
- open ports `80` and `443`

## 2. Update DNS

In your DNS provider:

1. remove any old apex `A` records that still point at a previous host
2. remove any old `www` CNAME that still points at a previous provider
3. add a new apex `A` record:
   - host: `@`
   - value: `<your-vps-ip>`
4. add a new `www` CNAME:
   - host: `www`
   - value: `opennametags.org`

After DNS propagates, Caddy will automatically obtain HTTPS certificates.

## 3. Verify

On the VPS:

```bash
systemctl status ont-domain-web.service
systemctl status caddy.service
curl -s http://127.0.0.1:3002/api/health | jq
```

From your machine after DNS propagation:

```bash
curl -I https://opennametags.org
curl -s https://opennametags.org/api/health | jq
```

## 4. Rollback

If you need to pause the root-domain deployment:

```bash
ssh -i ~/.ssh/<your-key> root@<server-ip>
systemctl stop ont-domain-web.service
systemctl stop caddy.service
```

Then point DNS back to the previous provider.

## Notes

- The product branding is now `Open Name Tags`.
- The protocol identifier remains `ONT`.
- Existing protocol identifiers, JSON `kind` strings, and on-chain magic bytes remain unchanged.
- Any shared-host compatibility route is optional and deployment-specific.
- The dedicated `opennametags.org` deployment serves the app at the root path `/`.
