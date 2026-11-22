# A certificate needs attention

**From:** Cloudflare's email, to every admin, when a certificate for the domain fails to issue or
renew.

**Means:** soon, browsers will refuse the library's address.

## First look

- **SSL/TLS → Edge Certificates** for the zone: the certificate's status and what it waits for.
- The custom domains on `<slug>-web`, `<slug>-mcp` and the images bucket: each needs its
  certificate.

## Safe now

- A certificate stuck on validation: check that the DNS records Cloudflare made are still there,
  then **Retry**.
