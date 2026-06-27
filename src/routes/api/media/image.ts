import { createFileRoute } from "@tanstack/react-router";
import { isAllowedExternalImageUrl } from "@/lib/media-proxy";

export const Route = createFileRoute("/api/media/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const imageUrl = requestUrl.searchParams.get("url");

        if (!imageUrl || !isAllowedExternalImageUrl(imageUrl)) {
          return new Response("invalid_image_url", { status: 400 });
        }

        const upstream = await fetch(imageUrl, {
          headers: {
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          },
        });

        if (!upstream.ok || !upstream.body) {
          return new Response("image_unavailable", { status: upstream.status || 502 });
        }

        const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
        const cacheControl = upstream.headers.get("cache-control") ?? "public, max-age=3600";

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Cache-Control": cacheControl,
            "Content-Type": contentType,
          },
        });
      },
    },
  },
});
