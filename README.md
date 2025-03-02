# DOtunnel

> [!NOTE]
> DOtunnel is actively under development.

Expose your local servers to the public internet easily and reliably.

DOtunnel is a BYOC("Bring Your Own Cloudflare") alternative to ngrok designed for better DX and reliabiltiy. It leverages Cloudflare [Durable Objects] to be automatically scalable – ideal for teams and organizations of all sizes.

## Highlights

- BYOC (Bring Your Own Cloudflare), no paywall, free to start and pay-as-you-go
- Reliability guaranteed by Cloudflare [Durable Objects]
- Security features for organizations
- Built-in web server for static files

### What's difference from the Cloudflare Tunnel?

Cloudflare already offers the same product of its own, called [Cloudflare Tunnel] (formerly Argo Tunnel), as a part of their SASE solution. If your organization already using Cloudflare Zero Trust service, check it out first.

Cloudflare Tunnel connects via `cloudflared`, which is the Cloudflare's ZTNA agent. But it requires overly complex configuration and management IMHO. Even though I only use developer platform and I don't need any other ZTNA features, they still require additional charge for the entire ZTNA service. It is a significant paywall to organizations.

DOtunnel is focusing on **development purpose only**. So it can more concise configuration to maximize productivity, also it is charged transparently based on the Workers' pricing.

### What's differee from other projects?

You can find many other similar free open-source projects from [awesome-tunneling](https://github.com/anderspitman/awesome-tunneling)

However, most of them don't address scalability. This can cause complications for teams of 100+ developers, as handling multiple traffic sources simultaneously introduces complex concurrency issues.

And some of them lack essential features for organizational use, such as access control and auditing. Others are too complex to setup and administrate.

DOtunnel aims good balance for dev tunneling needs, regardless of the size or requirements of the organization.

## Installation

TBD

## CLI usage

### Initial setup

First you should setup global config with profiles. Profiles allow you to manage settings and connections for different relay server or users.

- Set up your default profile:
  ```sh
  dotunnel setup
  ```

- (Optional) Set up additional profiles:
  ```sh
  dotunnel setup --profile work
  ```

Your config is located under `${XDG_CONFIG_HOME:-$HOME/.config}/dotunnel/config.toml`.

### Per-project setup

TBD

### Authentication

DOtunnel requires authentication before any operation. You can login to the relay server ahead of operation, or skip this step until actual use.

- Authenticate for a profile:
  ```sh
  dotunnel login 
  dotunnel login --profile work 
  ```
  (Follow the browser instructions to complete authentication)

### Exposing local servers

- Expose via pre-configured tunnel:
  ```sh
  dotunnel [profile=default]
  ```

- Expose a local HTTP server:
  ```sh
  dotunnel expose :8000
  ```

- Expose with a specific profile:
  ```sh
  dotunnel expose :8000 --profile project
  ```

### Exposing static files

DOtunnel has a built-in server for simple static file serving.

- Serve static files from directory:
  ```sh
  # expose a directory
  dotunnel expose ./public

  # expose a directory into a subpath
  dotunnel expose --mount="/admin" ./public
  ```

- Serve plain text:
  ```sh
  dotunnel expose echo:"Hello DOtunnel!"
  ```

- Serve files from a ZIP archive:
  ```sh
  dotunnel expose zip:./build.zip
  ```

That's not done! Run `dotunnel --help` to see full usage.

## Deploy your own relay server

TBD

## Security & Privacy

DOtunnel is designed for development purposes and organizational use.

Every tunnel is secured via a WebSocket Secure connection, but TLS is going to be terminated once it reaches the Cloudflare infrastructure (You should trust them), allowing content to be read or manipulated for productivity features and auditing.

However, this doesn't necessarily mean you cannot use DOtunnel for private use. You can configure another relay server into your personal Cloudflare account. DOtunnel CLI supports multiple relay servers via `--profile`.

**Be aware you're exposing your data to the public internet.** Tunnel addresses could be scanned. DOtunnel and Cloudflare platform add some additional security layers (TBD), but they couldn't be completely secure. Avoid exposing sensitive files or credentials, and keep sessions shortly.

## Caveats

Theoretically, Durable Objects would be the perfect fit for tunneling, but this isn't always the case in the real world.

Because DOs don't colocate with workers in all regions (yet). Depending on your regional location, inefficient round trips may occur. You can find more information from [Where Durable Objects Live]

## LICENSE

MIT

[Cloudflare Tunnel]: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
[Durable Objects]: https://developers.cloudflare.com/durable-objects/
[Where Durable Objects Live]: https://where.durableobjects.live/
