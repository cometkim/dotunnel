# DOtunnel

Expose your local servers to the public internet with ease and reliability.

DOtunnel is a self-hosted alternative to ngrok that offers greater control and flexibility. It uses Cloudflare [Durable Objects] to ensure consistent performance and horizontal scalability, making it ideal for organizations and developers alike.

**DOtunnel is currently under development. Stay tuned!**

## Features

- Self-hosted on your own Cloudflare account
- Consistent performance and scalability with Cloudflare [Durable Objects]
- Less operational burden by leveraging Cloudflare platform
- Powerful management and integration features for organizations
- Built-in web server for easy testing of static file servers

### What's difference from Cloudflare Tunnel?

Cloudflare already offers the same service of its own, called [Cloudflare Tunnel], as a part of their SASE solution. If your organization already using Cloudflare Zero Trust, check it out first.

Cloudflare Tunnel connects via `cloudflared`, which is the Cloudflare's ZTNA agent. There's a lot of functionality there, and my team members were already overwhelmed before migrating from ngrok. Even though we don't need all of those features, we still have to face an unreasonable paywall for basic requirements such as SSO and SCIM integration.

DOtunnel has selected features for tunneling purposes only. So it can maximize productivity via a more concise configuration and focused feature support, also it is charged transparently based on the Workers' pricing.

## Installation

TBD

## CLI Usage

First, you need to setup your DOtunnel provider.

```sh
# setup default profile
dotunnel setup

# setup profile with name "work"
dotunnel setup --profile work
```

DOtunnel requires authentication before any operation. Enter the command and proceed in the browser. (Or you can leave it out for actual use)

```sh
dotunnel login
dotunnel login --profile work
```

That's it. You can now expose any of your local HTTP service into the public internet.

```sh
# expose [::]:8000 to the public internet
dotunnel expose 8000

# expose it with specific subdomain
dotunnel expose 8000 --as subdomain
```

If you have only static file(s), DOtunnel can directly serve them without any additional server.

```sh
# expose ./public directory to the public internet
dotunnel expose ./public

# expose ./build.zip archive content to the public internet
dotunnel expose zip:./build.zip

# expose static text to the public internet
dotunnel expose text:"Ok"
dotunnel expose text:./my-secret.txt
```

Run `dotunnel --help` to see full detail.

## Deploy your own relay server

TBD

## Security & Privacy

DOtunnel is designed for organizational use and development purposes.

Every tunnel is secured via a WebSocket Secure connection, but TLS is going to be terminated once it reaches the Cloudflare infrastructure (You should trust them), allowing content to be read or manipulated for productivity and security features.

However, this doesn't necessarily mean you cannot use DOtunnel for private use. You can configure another relay server into your personal Cloudflare account. DOtunnel CLI supports multiple relay servers via `--profile`.

## Caveats

Ideally, Durable Objects would be the perfect fit for tunneling, but this isn't always the case.

Because DOs don't colocate with workers in all regions (yet). Depending on your regional location, inefficient round trips may occur. You can test it from [Where Durable Objects Live]

It can be similar to network throttling even if you don't want it to. (it might be good for testing)

## LICENSE

MIT

[Cloudflare Tunnel]: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
[Durable Objects]: https://developers.cloudflare.com/durable-objects/
[Where Durable Objects Live]: https://where.durableobjects.live/
