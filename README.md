# DOtunnel

Expose your local servers to the public internet easily and reliably.

DOtunnel is a self-hosted alternative to ngrok designed for simplicity and scale. It leverages Cloudflare [Durable Objects] for consistent performance and effortless horizontal scaling – ideal for teams and organizations of all sizes.

**DOtunnel is currently under development. Stay tuned!**

## Highlights

- Self-hosted on your own Cloudflare account
- Consistent performance and horizontal scalability with Cloudflare [Durable Objects]
- Reduced operational overhead by leveraging Cloudflare platform
- No paywall, free to start and pay-as-you-go
- Powerful management and integration features for organizations
- Built-in web server for easy testing of static file servers

### What's difference from Cloudflare Tunnel?

Cloudflare already offers the same service of its own, called [Cloudflare Tunnel], as a part of their SASE solution. If your organization already using Cloudflare Zero Trust, check it out first.

Cloudflare Tunnel connects via `cloudflared`, which is the Cloudflare's ZTNA agent. There's a lot of functionality there, and my team found the complexity overwhelming before migrating from ngrok. Even though we don't need all of those features, we still have to face an unreasonable paywall for basic requirements such as SSO and SCIM integration.

DOtunnel has selected features for tunneling purposes only. So it can maximize productivity via a more concise configuration and focused feature support, also it is charged transparently based on the Workers' pricing.

### What's differee from other projects?

You can find many (so many!) other similar free open-source projects from [awesome-tunneling](https://github.com/anderspitman/awesome-tunneling)

However, most of them don't address horizontal scalability. This can cause complications for teams of 100+ developers, as handling multiple traffic sources simultaneously introduces complex concurrency issues.

And some of them lack essential features for organizational use, such as access control, and audit logging. Others require overly complex configurations, making them difficult to set up and manage.

DOtunnel is trying to strike the perfect balance for all your tunneling needs, regardless of the size or requirements of your organization.

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

Your global config is located under `${XDG_CONFIG_HOME:-$HOME/.config}/.dotunnel/config.toml`.

### Authentication

DOtunnel requires authentication before any operation. You can login to the relay server ahead of operation, or skip this step until actual use.

- Authenticate for a profile:
  ```sh
  dotunnel login 
  dotunnel login --profile work 
  ```
  (Follow the browser instructions to complete authentication)

### Exposing local servers

- Expose a local HTTP server:
  ```sh
  dotunnel expose 8000
  ```

- Expose with a specific subdomain:
  ```sh
  dotunnel expose 8000 --as subdomain
  ```

- Expose with a randomly-generated subdomain:
  ```sh
  dotunnel expose 8000 --as-random
  ```

### Exposing static files

DOtunnel has a built-in server for simple static file hosting.

- Serve static files directly:
  ```sh
  dotunnel expose ./public
  ```

- Serve text content:
  ```sh
  dotunnel expose text:"Ok"
  dotunnel expose text:"$MY_SECRET"
  dotunnel expose text:./my-secret.txt
  ```

- Serve content of ZIP archive:
  ```sh
  dotunnel expose zip:./build.zip 
  ```

That's not done! Run `dotunnel --help` to see full usage.

## Deploy your own relay server

TBD

## Security & Privacy

DOtunnel is designed for organizational use and development purposes.

Every tunnel is secured via a WebSocket Secure connection, but TLS is going to be terminated once it reaches the Cloudflare infrastructure (You should trust them), allowing content to be read or manipulated for productivity and security features.

However, this doesn't necessarily mean you cannot use DOtunnel for private use. You can configure another relay server into your personal Cloudflare account. DOtunnel CLI supports multiple relay servers via `--profile`.

## Caveats

Ideally, Durable Objects would be the perfect fit for tunneling, but this isn't always the case.

Because DOs don't colocate with workers in all regions (yet). Depending on your regional location, inefficient round trips may occur. You can find more information from [Where Durable Objects Live]

It can simulate delaying network even if you don't want it to. (it might be good for testing)

## LICENSE

MIT

[Cloudflare Tunnel]: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
[Durable Objects]: https://developers.cloudflare.com/durable-objects/
[Where Durable Objects Live]: https://where.durableobjects.live/
